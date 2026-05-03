"""Stage 3: structured JSON line logs for Cloud Run workers (pipeline observability).

Logs go to stderr on logger ``pipeline.observability`` as single-line JSON objects
(schema ``pipeline.log.v1``). Human-readable logs from other loggers are unchanged.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime, timezone
from typing import Any

LOG_SCHEMA_V1 = "pipeline.log.v1"

_service_name = "unknown"


def configure_structured_pipeline_logging(service_name: str) -> logging.Logger:
    """Attach a JSON-only handler so each ``pipeline.observability`` record is one JSON line."""
    global _service_name
    _service_name = service_name
    log = logging.getLogger("pipeline.observability")
    log.handlers.clear()
    log.propagate = False
    log.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(handler)
    return log


def monotonic_ms() -> float:
    """Milliseconds since an arbitrary point (use deltas with ``time.monotonic()``)."""
    return time.monotonic() * 1000.0


def elapsed_ms_since(t0_monotonic_ms: float) -> float:
    """Elapsed ms since ``t0_monotonic_ms`` from ``monotonic_ms()``."""
    return round(monotonic_ms() - t0_monotonic_ms, 2)


def log_pipeline_event(
    *,
    video_id: str,
    stage: str,
    event: str,
    status: str = "",
    attempt: int | None = None,
    duration_ms: float | None = None,
    error_code: str | None = None,
    **extra: Any,
) -> None:
    """Emit one JSON log line with standard pipeline fields.

    ``stage`` is the pipeline lane: ``audio``, ``cv``, ``orchestrator``.
    ``event`` names the step: e.g. ``run_start``, ``run_complete``, ``run_failed``.
    """
    log = logging.getLogger("pipeline.observability")
    vid = video_id.strip() if video_id else "-"
    payload: dict[str, Any] = {
        "schema": LOG_SCHEMA_V1,
        "ts": datetime.now(tz=timezone.utc).isoformat(),
        "service": _service_name,
        "video_id": vid,
        "stage": stage,
        "event": event,
        "status": status if status else None,
        "attempt": attempt,
        "duration_ms": duration_ms,
        "error_code": error_code,
    }
    for k, v in extra.items():
        if v is not None:
            payload[k] = v
    log.info(json.dumps(payload, ensure_ascii=False))
