"""Tests for structured pipeline JSON logging."""

from __future__ import annotations

import json
import logging

from src.common.pipeline_logging import (
    LOG_SCHEMA_V1,
    configure_structured_pipeline_logging,
    log_pipeline_event,
    monotonic_ms,
)


class _Capture(logging.Handler):
    def __init__(self, bucket: list[str]) -> None:
        super().__init__()
        self._bucket = bucket

    def emit(self, record: logging.LogRecord) -> None:
        self._bucket.append(record.getMessage())


def test_log_pipeline_event_roundtrip() -> None:
    captured: list[str] = []
    configure_structured_pipeline_logging("unit-test")
    log = logging.getLogger("pipeline.observability")
    log.addHandler(_Capture(captured))

    log_pipeline_event(
        video_id="v1",
        stage="audio",
        event="run_failed",
        status="failed",
        duration_ms=42.5,
        error_code="AUDIO_FFMPEG_FAILED",
        retryable=False,
    )
    assert captured
    payload = json.loads(captured[-1])
    assert payload["schema"] == LOG_SCHEMA_V1
    assert payload["service"] == "unit-test"
    assert payload["video_id"] == "v1"
    assert payload["stage"] == "audio"
    assert payload["event"] == "run_failed"
    assert payload["status"] == "failed"
    assert payload["duration_ms"] == 42.5
    assert payload["error_code"] == "AUDIO_FFMPEG_FAILED"
    assert payload["retryable"] is False


def test_monotonic_ms_elapsed() -> None:
    t0 = monotonic_ms()
    assert monotonic_ms() >= t0
