from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.generate_pdf import generate_pdf_for_video_id
from src.audio.schemas import AudioAnalysisResult
from src.config import BucketConfig
from src.env_bootstrap import load_dotenv_files
from src.orchestrator.gemini_client import ReportOrchestrator

load_dotenv_files(ROOT)
# Cloud Run uses ADC via service account; ignore local key-file hints.
os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("orchestrator_worker")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "senior-design-488908")
PROCESSED_BUCKET = os.environ.get("GCS_BUCKET_NAME", "lectureai_processed")
STATE_PREFIX = "pipeline_state"
TOPIC_REPORT_DONE = "lecture-report-completed"

app = FastAPI(title="orchestrator-worker")


class PubSubMessage(BaseModel):
    data: str
    messageId: str | None = None
    publishTime: str | None = None


class PubSubPushRequest(BaseModel):
    message: PubSubMessage
    subscription: str | None = None


def _bucket_config() -> BucketConfig:
    return BucketConfig(
        videos=os.environ.get("GCS_FULL_VIDEOS_BUCKET", "lectureai_full_videos"),
        processed=PROCESSED_BUCKET,
        transcripts=PROCESSED_BUCKET,
        audio=PROCESSED_BUCKET,
        video_key="Lesson_Records/{video_id}.mp4",
        cv_key="results/{video_id}/lecture_report.json",
        report_key="reports/{video_id}.json",
        processed_audio_json_key="data/audio/{video_id}.json",
        processed_transcript_txt_key="transcripts/{video_id}.txt",
    )


def _state_blob(video_id: str) -> str:
    return f"{STATE_PREFIX}/{video_id}.json"


def _read_state(video_id: str) -> Dict[str, bool]:
    from google.cloud import storage

    storage_client = storage.Client()
    blob = storage_client.bucket(PROCESSED_BUCKET).blob(_state_blob(video_id))
    if not blob.exists(storage_client):
        return {"cv_done": False, "audio_done": False}
    try:
        return json.loads(blob.download_as_text())
    except Exception:
        return {"cv_done": False, "audio_done": False}


def _write_state(video_id: str, state: Dict[str, bool]) -> None:
    from google.cloud import storage

    storage_client = storage.Client()
    blob = storage_client.bucket(PROCESSED_BUCKET).blob(_state_blob(video_id))
    blob.upload_from_string(json.dumps(state), content_type="application/json")


def _load_audio_result(video_id: str) -> AudioAnalysisResult:
    from google.cloud import storage

    storage_client = storage.Client()
    path = f"data/audio/{video_id}.json"
    blob = storage_client.bucket(PROCESSED_BUCKET).blob(path)
    payload = blob.download_as_text()
    return AudioAnalysisResult.model_validate_json(payload)


async def _run_orchestrator(video_id: str) -> None:
    from google.cloud import storage

    storage_client = storage.Client()
    orchestrator = ReportOrchestrator(
        gemini_api_key=os.environ["GEMINI_API_KEY"],
        buckets=_bucket_config(),
    )
    audio_result = _load_audio_result(video_id)
    report = await orchestrator.generate_report(video_id, audio_result)
    await asyncio.to_thread(
        generate_pdf_for_video_id,
        storage_client=storage_client,
        bucket_name=PROCESSED_BUCKET,
        video_id=video_id,
        report=report,
    )


def _decode_payload(encoded_data: str) -> dict:
    try:
        decoded = base64.b64decode(encoded_data).decode("utf-8")
        return json.loads(decoded)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid pubsub message payload: {exc}") from exc


def _signal_key(subscription: str | None) -> str:
    if subscription and "orchestrator-audio-sub" in subscription:
        return "audio_done"
    return "cv_done"


@app.post("/run")
async def run(push: PubSubPushRequest) -> dict:
    payload = _decode_payload(push.message.data)
    video_id = payload.get("video_id")
    if not video_id:
        raise HTTPException(status_code=400, detail="video_id is required")
    if os.environ.get("WORKER_DRY_RUN", "").lower() == "true":
        logger.info("orchestrator dry-run video_id=%s", video_id)
        return {"ok": True, "video_id": video_id, "dry_run": True}

    try:
        signal_key = _signal_key(push.subscription)
        state = _read_state(video_id)
        state[signal_key] = True
        _write_state(video_id, state)
        logger.info("state updated video_id=%s state=%s", video_id, state)

        if state.get("cv_done") and state.get("audio_done"):
            from google.cloud import pubsub_v1

            await _run_orchestrator(video_id)
            publisher = pubsub_v1.PublisherClient()
            report_topic_path = publisher.topic_path(PROJECT_ID, TOPIC_REPORT_DONE)
            out = json.dumps({"video_id": video_id, "status": "completed"}).encode("utf-8")
            publisher.publish(report_topic_path, out).result(timeout=30)
            logger.info("report completed video_id=%s", video_id)

        return {"ok": True, "video_id": video_id, "state": state}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("orchestrator failed for video_id=%s: %s", video_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
