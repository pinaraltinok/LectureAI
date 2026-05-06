from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.generate_pdf import generate_pdf_for_video_id
from src.audio.schemas import AudioAnalysisResult
from src.common.config import OrchestratorWorkerSettings
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
from src.orchestrator.gemini_client import ReportOrchestrator
from src.orchestrator.report_schema import QAReport

load_dotenv_files(ROOT)
# Cloud Run uses ADC via service account; ignore local key-file hints.
os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
settings = OrchestratorWorkerSettings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
configure_structured_pipeline_logging("orchestrator-worker")
logger = logging.getLogger("orchestrator_worker")

PROJECT_ID = settings.google_cloud_project
PROCESSED_BUCKET = settings.gcs_bucket_name
STATE_PREFIX = "pipeline_state"
TOPIC_REPORT_DONE = "lecture-report-completed"

app = FastAPI(title="orchestrator-worker")


def _bucket_config() -> BucketConfig:
    return BucketConfig(
        videos=settings.gcs_full_videos_bucket,
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


def _utc_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _default_state() -> Dict[str, Any]:
    return {
        "audio_done": False,
        "cv_done": False,
        "audio_artifact_exists": False,
        "cv_artifact_exists": False,
        "report_json_exists": False,
        "report_pdf_exists": False,
        "report_done": False,
        "report_quality_passed": None,
        "last_signal": "",
        "updated_at": _utc_now(),
    }


def _read_state(video_id: str) -> Dict[str, Any]:
    storage_client = get_storage_client()
    blob = storage_client.bucket(PROCESSED_BUCKET).blob(_state_blob(video_id))
    if not blob.exists(storage_client):
        return _default_state()
    try:
        text = blob.download_as_bytes().decode("utf-8-sig")
        raw = json.loads(text)
        if not isinstance(raw, dict):
            return _default_state()
        out = _default_state()
        out.update(raw)
        return out
    except Exception:
        return _default_state()


def _write_state(video_id: str, state: Dict[str, Any]) -> None:
    storage_client = get_storage_client()
    blob = storage_client.bucket(PROCESSED_BUCKET).blob(_state_blob(video_id))
    state["updated_at"] = _utc_now()
    blob.upload_from_string(
        json.dumps(state, ensure_ascii=False, indent=2),
        content_type="application/json",
    )


def _artifact_flags(video_id: str) -> Dict[str, bool]:
    storage_client = get_storage_client()
    bucket = storage_client.bucket(PROCESSED_BUCKET)

    def exists(path: str) -> bool:
        return bool(bucket.blob(path).exists(storage_client))

    audio_json = exists(f"data/audio/{video_id}.json")
    transcript_txt = exists(f"transcripts/{video_id}.txt")
    cv_json = exists(f"results/{video_id}/lecture_report.json") or exists(
        f"results/{video_id}.json"
    )
    report_json = exists(f"reports/{video_id}.json")
    report_pdf = exists(f"pdfs/{video_id}.pdf")

    return {
        "audio_artifact_exists": bool(audio_json or transcript_txt),
        "cv_artifact_exists": bool(cv_json),
        "report_json_exists": bool(report_json),
        "report_pdf_exists": bool(report_pdf),
    }


def _load_audio_result(video_id: str) -> AudioAnalysisResult:
    storage_client = get_storage_client()
    path = f"data/audio/{video_id}.json"
    blob = storage_client.bucket(PROCESSED_BUCKET).blob(path)
    payload = blob.download_as_text()
    return AudioAnalysisResult.model_validate_json(payload)


async def _run_orchestrator(video_id: str) -> QAReport:
    storage_client = get_storage_client()
    raw_order = settings.orchestrator_provider_order.strip()
    openrouter_key = settings.openrouter_api_key.strip()
    if raw_order:
        provider_order = tuple(
            p.strip().lower() for p in raw_order.split(",") if p.strip()
        )
    elif openrouter_key:
        provider_order = ("openrouter", "aistudio", "groq")
    elif settings.gemini_api_key.strip():
        provider_order = ("aistudio", "groq")
    else:
        provider_order = ("gemini", "groq")
    chunk_min = settings.chunk_minutes
    degraded = settings.orchestrator_degraded_fallback.strip().lower()
    spacing_raw = settings.orchestrator_llm_spacing_sec.strip()
    try:
        llm_spacing_sec = float(spacing_raw) if spacing_raw else 0.0
    except ValueError:
        llm_spacing_sec = 0.0
    def _status_from_orchestrator(event: str, detail: str) -> None:
        notify_backend("orchestrator", event, video_id, detail)

    orchestrator = ReportOrchestrator(
        gemini_api_key=settings.gemini_api_key.strip() or None,
        groq_api_key=settings.groq_api_key.strip() or None,
        groq_extra_api_key=settings.groq_extra.strip() or None,
        openrouter_api_key=settings.openrouter_api_key.strip() or None,
        openrouter_model=settings.openrouter_model.strip() or None,
        quality_agent_model=settings.quality_agent_model.strip() or None,
        buckets=_bucket_config(),
        google_cloud_project=PROJECT_ID,
        gemini_provider=settings.gemini_provider,
        vertex_location=settings.vertex_location,
        gemini_model=settings.gemini_model,
        groq_model=settings.groq_model,
        provider_order=provider_order if provider_order else ("gemini", "groq"),
        chunk_minutes=chunk_min,
        degraded_fallback=degraded in {"1", "true", "yes", "on"},
        llm_spacing_sec=llm_spacing_sec,
        status_callback=_status_from_orchestrator,
    )
    notify_backend("orchestrator", "loading_audio_input", video_id, "reading data/audio JSON")
    audio_result = _load_audio_result(video_id)
    notify_backend("orchestrator", "report_generation_started", video_id)
    report = await orchestrator.generate_report(video_id, audio_result)
    notify_backend("orchestrator", "pdf_generation_started", video_id)
    await asyncio.to_thread(
        generate_pdf_for_video_id,
        storage_client=storage_client,
        bucket_name=PROCESSED_BUCKET,
        video_id=video_id,
        report=report,
    )
    notify_backend("orchestrator", "pdf_generation_completed", video_id)
    return report


def _signal_key(subscription: str | None) -> str:
    if subscription and "orchestrator-audio-sub" in subscription:
        return "audio_done"
    return "cv_done"


def _extract_subscription(body: dict) -> str | None:
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="request body must be a JSON object")
    return body.get("subscription")


def _require_retry_auth(request: Request) -> None:
    expected = (settings.backend_status_webhook_bearer or "").strip()
    if not expected:
        return
    auth = (request.headers.get("authorization") or "").strip()
    # Accept Cloud Run IAM OIDC tokens (JWT format with dots) — IAM already validated them
    if auth.startswith("Bearer ") and "." in auth.split(" ", 1)[1]:
        return
    if auth != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.post("/run")
async def run(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    try:
        body = await request.json()
    except Exception as exc:
        raw = await request.body()
        logger.error("JSON parse error: %s", exc)
        logger.error("Raw body: %s", raw[:200])
        return JSONResponse({"error": "invalid json"}, status_code=400)
    body_keys = sorted(body.keys()) if isinstance(body, dict) else []
    message = body.get("message") if isinstance(body, dict) else None
    message_keys = sorted(message.keys()) if isinstance(message, dict) else []
    data_value = (
        message.get("data")
        if isinstance(message, dict) and message.get("data") is not None
        else body.get("data")
        if isinstance(body, dict)
        else None
    )
    data_len = len(str(data_value)) if data_value is not None else 0
    logger.info(
        "run debug: content_type=%s body_keys=%s message_keys=%s has_data=%s data_len=%s",
        content_type,
        body_keys,
        message_keys,
        data_value is not None,
        data_len,
    )
    try:
        subscription = _extract_subscription(body)
        video_id = decode_pubsub_payload(body)
        logger.info(
            "run debug: subscription=%s video_id=%s",
            subscription,
            video_id,
        )
    except Exception as exc:
        # Pub/Sub push can get stuck retrying poison messages forever.
        # Treat malformed envelopes as dropped+acked to keep the pipeline healthy.
        logger.warning(
            "dropping malformed push: %s body_keys=%s content_type=%s",
            exc,
            body_keys,
            content_type,
        )
        return {"ok": True, "dropped": True, "reason": "malformed_payload"}
    if settings.worker_dry_run:
        logger.info("orchestrator dry-run video_id=%s", video_id)
        log_pipeline_event(
            video_id=video_id,
            stage="orchestrator",
            event="run_complete",
            status="dry_run",
        )
        return {"ok": True, "video_id": video_id, "dry_run": True}

    t0 = monotonic_ms()
    try:
        signal_key = _signal_key(subscription)
        log_pipeline_event(
            video_id=video_id,
            stage="orchestrator",
            event="run_start",
            status="started",
            signal=signal_key,
        )
        state = _read_state(video_id)
        state[signal_key] = True
        state["last_signal"] = signal_key
        flags = await asyncio.to_thread(_artifact_flags, video_id)
        state.update(flags)
        # Artifact existence should also mark completion, even if push signals arrived late/out-of-order.
        if state.get("audio_artifact_exists"):
            state["audio_done"] = True
        if state.get("cv_artifact_exists"):
            state["cv_done"] = True
        # Always derive from GCS artifacts so stale persisted report_done cannot
        # skip PDF generation when JSON exists but PDF is missing.
        state["report_done"] = bool(
            state.get("report_json_exists") and state.get("report_pdf_exists")
        )
        _write_state(video_id, state)
        logger.info("state updated video_id=%s state=%s", video_id, state)
        notify_backend("orchestrator", "state_updated", video_id, json.dumps(state, ensure_ascii=False))

        if state.get("report_done"):
            notify_backend(
                "orchestrator",
                "skipped_report_exists",
                video_id,
                "report json/pdf already exists; orchestrator will not rerun",
            )
            log_pipeline_event(
                video_id=video_id,
                stage="orchestrator",
                event="run_complete",
                status="skipped",
                duration_ms=elapsed_ms_since(t0),
                outcome="report_exists",
            )
            return {"ok": True, "video_id": video_id, "state": state, "skipped": True}

        if not state.get("audio_done") or not state.get("cv_done"):
            wait_reason = []
            if not state.get("audio_done"):
                wait_reason.append("audio")
            if not state.get("cv_done"):
                wait_reason.append("cv")
            notify_backend(
                "orchestrator",
                "waiting_for_dependencies",
                video_id,
                f"waiting_for={','.join(wait_reason)}",
            )
            log_pipeline_event(
                video_id=video_id,
                stage="orchestrator",
                event="run_complete",
                status="waiting",
                duration_ms=elapsed_ms_since(t0),
                outcome="dependencies",
                waiting_for=wait_reason,
            )
            return {"ok": True, "video_id": video_id, "state": state, "waiting_for": wait_reason}

        if state.get("cv_done") and state.get("audio_done"):
            notify_backend("orchestrator", "started", video_id, "audio+cv ready; running report orchestration")
            report = await _run_orchestrator(video_id)
            post_flags = await asyncio.to_thread(_artifact_flags, video_id)
            state.update(post_flags)
            state["report_done"] = bool(
                state.get("report_json_exists") and state.get("report_pdf_exists")
            )
            qp = getattr(report, "quality_passed", None)
            if qp is not None:
                state["report_quality_passed"] = qp
            if state.get("report_done"):
                state.pop("report_error", None)
                state.pop("report_needs_review", None)
            _write_state(video_id, state)
            publisher = get_pubsub_publisher()
            report_topic_path = publisher.topic_path(PROJECT_ID, TOPIC_REPORT_DONE)
            out = json.dumps({"video_id": video_id, "status": "completed"}).encode("utf-8")
            publisher.publish(report_topic_path, out).result(timeout=30)
            logger.info("report completed video_id=%s", video_id)
            notify_backend(
                "orchestrator",
                "completed",
                video_id,
                json.dumps(
                    {
                        "report_json_exists": state.get("report_json_exists"),
                        "report_pdf_exists": state.get("report_pdf_exists"),
                    },
                    ensure_ascii=False,
                ),
            )

        log_pipeline_event(
            video_id=video_id,
            stage="orchestrator",
            event="run_complete",
            status="ok",
            duration_ms=elapsed_ms_since(t0),
            outcome="report_generated",
        )
        return {"ok": True, "video_id": video_id, "state": state}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("orchestrator failed for video_id=%s: %s", video_id, exc)
        retryable, err_code, _msg = classify_failure(
            exc, pipeline_stage="orchestrator", _video_id=video_id
        )
        log_pipeline_event(
            video_id=video_id,
            stage="orchestrator",
            event="run_failed",
            status="failed",
            duration_ms=elapsed_ms_since(t0),
            error_code=err_code,
            retryable=retryable,
        )
        try:
            state = _read_state(video_id)
            state["report_done"] = False
            state["report_error"] = str(exc)
            _write_state(video_id, state)
        except Exception:
            logger.warning("failed to persist orchestrator error state video_id=%s", video_id)
        notify_backend(
            "orchestrator",
            "failed",
            video_id,
            failed_event_detail(
                video_id=video_id,
                pipeline_stage="orchestrator",
                exc=exc,
            ),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/retry-report")
async def retry_report(request: Request) -> dict:
    _require_retry_auth(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="request body must be a JSON object")

    video_id = str(body.get("video_id") or "").strip()
    if not video_id:
        raise HTTPException(status_code=400, detail="video_id is required")

    force = bool(body.get("force", False))
    t0 = monotonic_ms()

    try:
        state = _read_state(video_id)
        flags = await asyncio.to_thread(_artifact_flags, video_id)
        state.update(flags)
        if state.get("audio_artifact_exists"):
            state["audio_done"] = True
        if state.get("cv_artifact_exists"):
            state["cv_done"] = True
        state["report_done"] = bool(
            state.get("report_json_exists") and state.get("report_pdf_exists")
        )
        _write_state(video_id, state)

        missing = []
        if not state.get("audio_done"):
            missing.append("audio")
        if not state.get("cv_done"):
            missing.append("cv")
        if missing:
            notify_backend(
                "orchestrator",
                "retry_blocked_missing_dependencies",
                video_id,
                f"missing={','.join(missing)}",
            )
            raise HTTPException(
                status_code=409,
                detail=f"cannot retry report: missing dependencies ({','.join(missing)})",
            )

        if state.get("report_done") and not force:
            return {
                "ok": True,
                "video_id": video_id,
                "skipped": True,
                "reason": "report_already_exists",
                "hint": "pass force=true to regenerate report/pdf",
                "state": state,
            }

        notify_backend(
            "orchestrator",
            "retry_started",
            video_id,
            "manual report-only retry triggered",
        )
        log_pipeline_event(
            video_id=video_id,
            stage="orchestrator",
            event="retry_report_start",
            status="started",
            force=force,
        )

        report = await _run_orchestrator(video_id)
        post_flags = await asyncio.to_thread(_artifact_flags, video_id)
        state.update(post_flags)
        state["report_done"] = bool(
            state.get("report_json_exists") and state.get("report_pdf_exists")
        )
        qp = getattr(report, "quality_passed", None)
        if qp is not None:
            state["report_quality_passed"] = qp
        if state.get("report_done"):
            state.pop("report_error", None)
            state.pop("report_needs_review", None)
        _write_state(video_id, state)

        publisher = get_pubsub_publisher()
        report_topic_path = publisher.topic_path(PROJECT_ID, TOPIC_REPORT_DONE)
        out = json.dumps(
            {"video_id": video_id, "status": "completed", "source": "manual_retry"}
        ).encode("utf-8")
        publisher.publish(report_topic_path, out).result(timeout=30)

        notify_backend(
            "orchestrator",
            "retry_completed",
            video_id,
            json.dumps(
                {
                    "report_json_exists": state.get("report_json_exists"),
                    "report_pdf_exists": state.get("report_pdf_exists"),
                    "quality_passed": state.get("report_quality_passed"),
                },
                ensure_ascii=False,
            ),
        )
        log_pipeline_event(
            video_id=video_id,
            stage="orchestrator",
            event="retry_report_complete",
            status="ok",
            duration_ms=elapsed_ms_since(t0),
            force=force,
        )
        return {"ok": True, "video_id": video_id, "retried": True, "state": state}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("retry-report failed for video_id=%s: %s", video_id, exc)
        retryable, err_code, _msg = classify_failure(
            exc, pipeline_stage="orchestrator", _video_id=video_id
        )
        log_pipeline_event(
            video_id=video_id,
            stage="orchestrator",
            event="retry_report_failed",
            status="failed",
            duration_ms=elapsed_ms_since(t0),
            error_code=err_code,
            retryable=retryable,
        )
        notify_backend(
            "orchestrator",
            "retry_failed",
            video_id,
            failed_event_detail(
                video_id=video_id,
                pipeline_stage="orchestrator",
                exc=exc,
            ),
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc
