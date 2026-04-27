from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.common.config import CvWorkerSettings
from src.common.pipeline_failure import classify_failure, failed_event_detail
from src.common.pipeline_logging import (
    configure_structured_pipeline_logging,
    elapsed_ms_since,
    log_pipeline_event,
    monotonic_ms,
)
from src.common.worker_utils import (
    decode_pubsub_payload,
    get_storage_client,
    notify_backend,
)
from src.cv_video_id import normalize_cv_video_id
from src.env_bootstrap import load_dotenv_files

load_dotenv_files(ROOT)
# Cloud Run uses ADC via service account; ignore local key-file hints.
os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
settings = CvWorkerSettings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
configure_structured_pipeline_logging("cv-worker")
logger = logging.getLogger("cv_worker")

app = FastAPI(title="cv-worker")


async def _forward_to_modal(video_id: str) -> None:
    url = settings.modal_cv_webhook_url.strip()
    if not url:
        raise HTTPException(
            status_code=503,
            detail="MODAL_CV_WEBHOOK_URL is not configured",
        )
    teacher_name = settings.cv_teacher_name
    headers: dict[str, str] = {"Content-Type": "application/json"}
    bearer = settings.modal_cv_webhook_bearer.strip()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    payload: dict[str, Any] = {"video_id": video_id, "teacher_name": teacher_name}
    timeout = httpx.Timeout(120.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code >= 400:
            body = response.text[:2000]
            logger.error(
                "modal webhook failed status=%s body=%s",
                response.status_code,
                body,
            )
            raise HTTPException(
                status_code=502,
                detail=f"modal webhook returned {response.status_code}",
            )


def _cv_artifact_exists(video_id: str) -> bool:
    bucket_name = settings.gcs_bucket_name
    storage_client = get_storage_client()
    bucket = storage_client.bucket(bucket_name)
    paths = [
        f"results/{video_id}/lecture_report.json",
        f"results/{video_id}.json",
    ]
    return any(bucket.blob(path).exists(storage_client) for path in paths)


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
        raw_id = decode_pubsub_payload(body)
        logger.info("VIDEO ID (raw): %s", raw_id)
        if not raw_id:
            return JSONResponse({"error": "no video_id"}, status_code=400)
        video_id = normalize_cv_video_id(str(raw_id))
        if not video_id:
            return JSONResponse({"error": "video_id empty after normalization"}, status_code=400)
        logger.info("VIDEO ID (normalized): %s", video_id)
    except Exception as exc:
        logger.error("PARSE ERROR: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=400)

    if settings.worker_dry_run:
        logger.info("cv dry-run video_id=%s", video_id)
        log_pipeline_event(
            video_id=video_id,
            stage="cv",
            event="run_complete",
            status="dry_run",
        )
        return {"ok": True, "video_id": video_id, "dry_run": True}

    t0 = monotonic_ms()
    try:
        log_pipeline_event(
            video_id=video_id,
            stage="cv",
            event="run_start",
            status="started",
        )
        notify_backend("cv", "started", video_id, "cv worker accepted request")
        exists = await asyncio.to_thread(_cv_artifact_exists, video_id)
        if exists:
            notify_backend("cv", "skipped_existing", video_id, "cv artifact already exists in GCS")
            notify_backend("cv", "completed", video_id, "no reprocess needed")
            log_pipeline_event(
                video_id=video_id,
                stage="cv",
                event="run_complete",
                status="skipped",
                duration_ms=elapsed_ms_since(t0),
                outcome="artifact_exists",
            )
            return {"ok": True, "video_id": video_id, "backend": "modal_http", "skipped": True}
        notify_backend("cv", "triggering_modal", video_id, "sending request to Modal CV pipeline")
        await _forward_to_modal(video_id)
        logger.info("cv modal invoke ok video_id=%s", video_id)
        notify_backend("cv", "triggered", video_id, "modal accepted request; waiting for lecture-cv-completed signal")
        log_pipeline_event(
            video_id=video_id,
            stage="cv",
            event="run_complete",
            status="ok",
            duration_ms=elapsed_ms_since(t0),
            outcome="modal_triggered",
        )
        return {"ok": True, "video_id": video_id, "backend": "modal_http", "triggered": True}
    except HTTPException as exc:
        retryable, err_code, _msg = classify_failure(
            exc, pipeline_stage="cv", _video_id=video_id
        )
        log_pipeline_event(
            video_id=video_id,
            stage="cv",
            event="run_failed",
            status="failed",
            duration_ms=elapsed_ms_since(t0),
            error_code=err_code,
            retryable=retryable,
            http_status=getattr(exc, "status_code", None),
        )
        raise
    except httpx.HTTPError as exc:
        logger.exception("cv modal HTTP error video_id=%s: %s", video_id, exc)
        retryable, err_code, _msg = classify_failure(
            exc, pipeline_stage="cv", _video_id=video_id
        )
        log_pipeline_event(
            video_id=video_id,
            stage="cv",
            event="run_failed",
            status="failed",
            duration_ms=elapsed_ms_since(t0),
            error_code=err_code,
            retryable=retryable,
        )
        notify_backend(
            "cv",
            "failed",
            video_id,
            failed_event_detail(video_id=video_id, pipeline_stage="cv", exc=exc),
        )
        raise HTTPException(status_code=502, detail="modal webhook unreachable") from exc
    except Exception as exc:
        logger.exception("cv worker failed for video_id=%s: %s", video_id, exc)
        retryable, err_code, _msg = classify_failure(
            exc, pipeline_stage="cv", _video_id=video_id
        )
        log_pipeline_event(
            video_id=video_id,
            stage="cv",
            event="run_failed",
            status="failed",
            duration_ms=elapsed_ms_since(t0),
            error_code=err_code,
            retryable=retryable,
        )
        notify_backend(
            "cv",
            "failed",
            video_id,
            failed_event_detail(video_id=video_id, pipeline_stage="cv", exc=exc),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def main() -> None:
    import uvicorn

    port = settings.port
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
