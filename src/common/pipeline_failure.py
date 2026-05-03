"""Unified failure classification and webhook ``failed`` payload (Stage 2).

``detail`` for ``notify_backend(..., status=\"failed\", ...)`` is a JSON string
with schema ``pipeline.failure.v1`` so backends can parse ``retryable`` and
``error_code`` without regex on free text.
"""

from __future__ import annotations

import json
from typing import Any

FAILURE_SCHEMA_V1 = "pipeline.failure.v1"
_MAX_MESSAGE_CHARS = 2000


def _truncate(msg: str, limit: int = _MAX_MESSAGE_CHARS) -> str:
    if len(msg) <= limit:
        return msg
    return msg[: limit - 3] + "..."


def _duck_audio_processing_error(exc: BaseException) -> bool:
    return hasattr(exc, "stage") and hasattr(exc, "message") and hasattr(
        exc, "video_id"
    )


def classify_failure(
    exc: BaseException,
    *,
    pipeline_stage: str,
    _video_id: str = "",
) -> tuple[bool, str, str]:
    """Return ``(retryable, error_code, safe_message)``.

    *retryable* hints Pub/Sub / ops (manual replay may still be needed).
    """
    msg = _truncate(str(exc))
    low = msg.lower()

    try:
        import httpx
    except ImportError:  # pragma: no cover
        httpx = None  # type: ignore[assignment]
    if httpx is not None and isinstance(exc, httpx.HTTPError):
        return True, "HTTP_TRANSPORT_ERROR", msg

    # --- Domain: audio pipeline (duck-type AudioProcessingError; avoid import cycle)
    if _duck_audio_processing_error(exc):
        inner = str(getattr(exc, "stage", "") or "")
        amsg = _truncate(str(getattr(exc, "message", msg)))
        alow = amsg.lower()
        if inner == "download_mp4" or inner == "download":
            if "not found" in alow or "source video not found" in alow:
                return False, "AUDIO_SOURCE_NOT_FOUND", amsg
            return True, "AUDIO_DOWNLOAD_FAILED", amsg
        if inner == "ffmpeg":
            return False, "AUDIO_FFMPEG_FAILED", amsg
        if inner == "upload_assemblyai":
            if "401" in amsg or "403" in amsg or "invalid api key" in alow:
                return False, "AUDIO_ASSEMBLYAI_AUTH_FAILED", amsg
            return True, "AUDIO_ASSEMBLYAI_SUBMIT_FAILED", amsg
        if inner == "transcription":
            if "429" in amsg or "rate" in alow:
                return True, "AUDIO_TRANSCRIPTION_RATE_LIMITED", amsg
            return True, "AUDIO_TRANSCRIPTION_FAILED", amsg
        if inner == "gcs_save":
            return True, "AUDIO_GCS_SAVE_FAILED", amsg
        return False, "AUDIO_PROCESSING_FAILED", amsg

    # --- httpx / network
    name = exc.__class__.__name__
    if name in (
        "ConnectError",
        "ReadTimeout",
        "WriteTimeout",
        "ConnectTimeout",
        "PoolTimeout",
    ) or "Timeout" in name:
        return True, "NETWORK_TRANSIENT", msg

    if name == "HTTPStatusError" and hasattr(exc, "response"):
        try:
            code = exc.response.status_code  # type: ignore[attr-defined]
            if code in (429, 502, 503, 504):
                return True, f"HTTP_{code}", msg
            if code >= 500:
                return True, f"HTTP_{code}", msg
            return False, f"HTTP_{code}", msg
        except Exception:
            pass

    # --- FastAPI HTTPException (raised after forward)
    if hasattr(exc, "status_code") and hasattr(exc, "detail"):
        try:
            code = int(getattr(exc, "status_code", 500))
            detail = getattr(exc, "detail", msg)
            dtext = detail if isinstance(detail, str) else str(detail)
            dtext = _truncate(dtext)
            if code in (502, 503, 504):
                return True, f"HTTP_{code}", dtext
            if code == 429:
                return True, "HTTP_429", dtext
            if code == 503:
                return True, "HTTP_503", dtext
            if code >= 400 and code < 500:
                return False, f"HTTP_{code}", dtext
            if code >= 500:
                return True, f"HTTP_{code}", dtext
        except Exception:
            pass

    # --- Google / GCS style
    if "TooManyRequests" in name or "429" in msg:
        return True, "RESOURCE_EXHAUSTED", msg
    if "503" in msg or "unavailable" in low:
        return True, "SERVICE_UNAVAILABLE", msg

    return False, "UNHANDLED_EXCEPTION", msg


def failed_event_detail(
    *,
    video_id: str,
    pipeline_stage: str,
    exc: BaseException | None = None,
    fallback_message: str | None = None,
    internal_stage: str | None = None,
) -> str:
    """Build JSON string for ``notify_backend`` *detail* when ``status == \"failed\"``."""
    if exc is not None:
        retryable, error_code, message = classify_failure(
            exc, pipeline_stage=pipeline_stage, _video_id=video_id
        )
    else:
        retryable, error_code, message = False, "UNKNOWN", _truncate(
            fallback_message or "failure"
        )

    payload: dict[str, Any] = {
        "schema": FAILURE_SCHEMA_V1,
        "video_id": video_id,
        "stage": pipeline_stage,
        "retryable": retryable,
        "error_code": error_code,
        "message": message,
    }
    is_ = (
        str(getattr(exc, "stage", "") or "")
        if exc is not None and _duck_audio_processing_error(exc)
        else (internal_stage or "")
    )
    if is_:
        payload["internal_stage"] = is_

    return json.dumps(payload, ensure_ascii=False)


def failed_event_detail_from_parts(
    *,
    video_id: str,
    pipeline_stage: str,
    retryable: bool,
    error_code: str,
    message: str,
    internal_stage: str | None = None,
) -> str:
    """When classification is already known (e.g. custom cv path)."""
    payload: dict[str, Any] = {
        "schema": FAILURE_SCHEMA_V1,
        "video_id": video_id,
        "stage": pipeline_stage,
        "retryable": retryable,
        "error_code": error_code,
        "message": _truncate(message),
    }
    if internal_stage:
        payload["internal_stage"] = internal_stage
    return json.dumps(payload, ensure_ascii=False)
