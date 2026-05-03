from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.audio.assemblyai_client import AudioAnalysisClient
from src.common.config import AudioWorkerSettings
from src.common.pipeline_failure import classify_failure, failed_event_detail
from src.common.pipeline_logging import (
    configure_structured_pipeline_logging,
    elapsed_ms_since,
    log_pipeline_event,
    monotonic_ms,
)
from src.common.worker_utils import (
    decode_pubsub_payload,
    get_pubsub_publisher,
    get_storage_client,
    notify_backend,
)
from src.config import BucketConfig
from src.env_bootstrap import load_dotenv_files

load_dotenv_files(ROOT)
# Cloud Run uses ADC via service account; ignore local key-file hints.
os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
settings = AudioWorkerSettings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
configure_structured_pipeline_logging("audio-worker")
logger = logging.getLogger("audio_worker")

PROJECT_ID = settings.google_cloud_project
COMPLETED_TOPIC_ID = "lecture-audio-completed"
app = FastAPI(title="audio-worker")


def _bucket_config() -> BucketConfig:
    return BucketConfig(
        videos=settings.gcs_full_videos_bucket,
        processed=settings.gcs_bucket_name,
        transcripts=settings.gcs_bucket_name,
        audio=settings.gcs_bucket_name,
        video_key="Lesson_Records/{video_id}.mp4",
        cv_key="results/{video_id}/lecture_report.json",
        report_key="reports/{video_id}.json",
        processed_audio_json_key="data/audio/{video_id}.json",
        processed_transcript_txt_key="transcripts/{video_id}.txt",
    )


def _audio_artifact_flags(video_id: str) -> dict[str, bool]:
    bucket_name = settings.gcs_bucket_name
    storage_client = get_storage_client()
    bucket = storage_client.bucket(bucket_name)
    audio_json = bucket.blob(f"data/audio/{video_id}.json")
    transcript_txt = bucket.blob(f"transcripts/{video_id}.txt")
    return {
        "audio_json_exists": bool(audio_json.exists(storage_client)),
        "transcript_exists": bool(transcript_txt.exists(storage_client)),
    }


def _publish_audio_completed(video_id: str) -> None:
    import json

    publisher = get_pubsub_publisher()
    completed_topic_path = publisher.topic_path(PROJECT_ID, COMPLETED_TOPIC_ID)
    out = json.dumps({"video_id": video_id, "status": "completed"}).encode("utf-8")
    publisher.publish(completed_topic_path, out).result(timeout=30)


@app.post("/run")
async def run(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception as exc:
        raw = await request.body()
        logger.error("JSON parse error: %s", exc)
        logger.error("Raw body: %s", raw[:200])
        return JSONResponse({"error": "invalid json"}, status_code=400)
    logger.info("RAW BODY: %s", body)

    try:
        video_id = decode_pubsub_payload(body)
        logger.info("VIDEO ID: %s", video_id)
        if not video_id:
            return JSONResponse({"error": "no video_id"}, status_code=400)
    except Exception as exc:
        logger.error("PARSE ERROR: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=400)

    if settings.worker_dry_run:
        logger.info("audio dry-run video_id=%s", video_id)
        log_pipeline_event(
            video_id=video_id,
            stage="audio",
            event="run_complete",
            status="dry_run",
        )
        return {"ok": True, "video_id": video_id, "dry_run": True}

    t0 = monotonic_ms()
    try:
        logger.info("processing audio video_id=%s", video_id)
        log_pipeline_event(
            video_id=video_id,
            stage="audio",
            event="run_start",
            status="started",
        )
        notify_backend("audio", "started", video_id, "audio worker accepted request")
        flags = await asyncio.to_thread(_audio_artifact_flags, video_id)
        if flags["audio_json_exists"] or flags["transcript_exists"]:
            logger.info("audio artifacts already exist for video_id=%s flags=%s", video_id, flags)
            notify_backend("audio", "skipped_existing", video_id, detail=str(flags))
            await asyncio.to_thread(_publish_audio_completed, video_id)
            notify_backend("audio", "completed", video_id, "signal published (existing artifact)")
            log_pipeline_event(
                video_id=video_id,
                stage="audio",
                event="run_complete",
                status="skipped",
                duration_ms=elapsed_ms_since(t0),
                outcome="artifact_exists",
            )
            return {"ok": True, "video_id": video_id, "skipped": True, "flags": flags}

        if not settings.assemblyai_api_key.strip():
            raise HTTPException(
                status_code=503,
                detail="ASSEMBLYAI_API_KEY is not configured",
            )

        client = AudioAnalysisClient(
            assemblyai_api_key=settings.assemblyai_api_key,
            buckets=_bucket_config(),
        )
        notify_backend("audio", "processing", video_id, "running AssemblyAI transcription")
        await client.analyze(video_id)
        notify_backend("audio", "gcs_uploaded", video_id, "audio json/transcript written")
        await asyncio.to_thread(_publish_audio_completed, video_id)
        logger.info("audio completed video_id=%s", video_id)
        notify_backend("audio", "completed", video_id, "audio_done signal published")
        log_pipeline_event(
            video_id=video_id,
            stage="audio",
            event="run_complete",
            status="ok",
            duration_ms=elapsed_ms_since(t0),
        )
        return {"ok": True, "video_id": video_id}
    except HTTPException as exc:
        retryable, err_code, _msg = classify_failure(
            exc, pipeline_stage="audio", _video_id=video_id
        )
        log_pipeline_event(
            video_id=video_id,
            stage="audio",
            event="run_failed",
            status="failed",
            duration_ms=elapsed_ms_since(t0),
            error_code=err_code,
            retryable=retryable,
            http_status=exc.status_code,
        )
        raise
    except Exception as exc:
        logger.exception("audio failed for video_id=%s: %s", video_id, exc)
        retryable, err_code, _msg = classify_failure(
            exc, pipeline_stage="audio", _video_id=video_id
        )
        log_pipeline_event(
            video_id=video_id,
            stage="audio",
            event="run_failed",
            status="failed",
            duration_ms=elapsed_ms_since(t0),
            error_code=err_code,
            retryable=retryable,
        )
        notify_backend(
            "audio",
            "failed",
            video_id,
            failed_event_detail(
                video_id=video_id,
                pipeline_stage="audio",
                exc=exc,
            ),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc
