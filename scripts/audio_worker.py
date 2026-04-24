from __future__ import annotations

import base64
import json
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
from src.config import BucketConfig
from src.env_bootstrap import load_dotenv_files

load_dotenv_files(ROOT)
# Cloud Run uses ADC via service account; ignore local key-file hints.
os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("audio_worker")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "senior-design-488908")
COMPLETED_TOPIC_ID = "lecture-audio-completed"
app = FastAPI(title="audio-worker")


def _bucket_config() -> BucketConfig:
    return BucketConfig(
        videos=os.environ.get("GCS_FULL_VIDEOS_BUCKET", "lectureai_full_videos"),
        processed=os.environ.get("GCS_BUCKET_NAME", "lectureai_processed"),
        transcripts=os.environ.get("GCS_BUCKET_NAME", "lectureai_processed"),
        audio=os.environ.get("GCS_BUCKET_NAME", "lectureai_processed"),
        video_key="Lesson_Records/{video_id}.mp4",
        cv_key="results/{video_id}/lecture_report.json",
        report_key="reports/{video_id}.json",
        processed_audio_json_key="data/audio/{video_id}.json",
        processed_transcript_txt_key="transcripts/{video_id}.txt",
    )


def _decode_payload(encoded_data: str) -> dict:
    def _fallback_kv_payload(raw: str) -> dict:
        stripped = raw.strip()
        if not (stripped.startswith("{") and stripped.endswith("}")):
            raise ValueError("payload is not object-like")
        inner = stripped[1:-1].strip()
        if not inner:
            return {}
        out: dict[str, str] = {}
        for chunk in inner.split(","):
            if ":" not in chunk:
                raise ValueError("payload item missing ':' separator")
            key, value = chunk.split(":", 1)
            out[key.strip().strip("\"'")] = value.strip().strip("\"'")
        return out

    try:
        decoded = base64.b64decode(encoded_data).decode("utf-8")
        try:
            return json.loads(decoded)
        except json.JSONDecodeError:
            # Accept legacy payloads like: {video_id:TUR40...}
            return _fallback_kv_payload(decoded)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid pubsub message payload: {exc}") from exc


@app.post("/run")
async def run(request: Request) -> dict:
    body = await request.json()
    logger.info("RAW BODY: %s", body)

    try:
        message = body.get("message", {}) if isinstance(body, dict) else {}
        data_b64 = message.get("data", "")
        logger.info("DATA B64: %s", data_b64)
        payload = _decode_payload(data_b64)
        logger.info("DECODED DATA: %s", payload)
        video_id = payload.get("video_id")
        logger.info("VIDEO ID: %s", video_id)
        if not video_id:
            return JSONResponse({"error": "no video_id"}, status_code=400)
    except Exception as exc:
        logger.error("PARSE ERROR: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=400)

    if os.environ.get("WORKER_DRY_RUN", "").lower() == "true":
        logger.info("audio dry-run video_id=%s", video_id)
        return {"ok": True, "video_id": video_id, "dry_run": True}

    try:
        logger.info("processing audio video_id=%s", video_id)
        from google.cloud import pubsub_v1

        client = AudioAnalysisClient(
            assemblyai_api_key=os.environ["ASSEMBLYAI_API_KEY"],
            buckets=_bucket_config(),
        )
        await client.analyze(video_id)

        publisher = pubsub_v1.PublisherClient()
        completed_topic_path = publisher.topic_path(PROJECT_ID, COMPLETED_TOPIC_ID)
        out = json.dumps({"video_id": video_id, "status": "completed"}).encode("utf-8")
        publisher.publish(completed_topic_path, out).result(timeout=30)
        logger.info("audio completed video_id=%s", video_id)
        return {"ok": True, "video_id": video_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("audio failed for video_id=%s: %s", video_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
