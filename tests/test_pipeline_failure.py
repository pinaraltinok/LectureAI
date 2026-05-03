"""Tests for ``src.common.pipeline_failure``."""

from __future__ import annotations

import json

import httpx

from src.common.pipeline_failure import (
    classify_failure,
    failed_event_detail,
    failed_event_detail_from_parts,
)


def _make_duck_audio_error(*, stage: str, message: str, video_id: str = "v1"):
    e = type("E", (Exception,), {})()
    e.stage = stage
    e.message = message
    e.video_id = video_id
    return e


def test_classify_source_not_found() -> None:
    e = _make_duck_audio_error(
        stage="download_mp4",
        message="Source video not found (tried): gs://…",
    )
    r, code, _msg = classify_failure(e, pipeline_stage="audio")
    assert r is False
    assert code == "AUDIO_SOURCE_NOT_FOUND"


def test_classify_ffmpeg_non_retryable() -> None:
    e = _make_duck_audio_error(stage="ffmpeg", message="conversion failed")
    r, code, _ = classify_failure(e, pipeline_stage="audio")
    assert r is False
    assert code == "AUDIO_FFMPEG_FAILED"


def test_classify_assemblyai_submit_retryable() -> None:
    e = _make_duck_audio_error(stage="upload_assemblyai", message="temporary network")
    r, code, _ = classify_failure(e, pipeline_stage="audio")
    assert r is True
    assert code == "AUDIO_ASSEMBLYAI_SUBMIT_FAILED"


def test_classify_httpx_transport_retryable() -> None:
    req = httpx.Request("POST", "https://example.invalid/modal")
    exc = httpx.ConnectError("connection refused", request=req)
    r, code, _ = classify_failure(exc, pipeline_stage="cv")
    assert r is True
    assert code == "HTTP_TRANSPORT_ERROR"


def test_failed_event_detail_json_roundtrip() -> None:
    e = _make_duck_audio_error(stage="transcription", message="AAI error xyz")
    raw = failed_event_detail(video_id="vid-1", pipeline_stage="audio", exc=e)
    payload = json.loads(raw)
    assert payload["schema"] == "pipeline.failure.v1"
    assert payload["video_id"] == "vid-1"
    assert payload["stage"] == "audio"
    assert payload["internal_stage"] == "transcription"
    assert payload["retryable"] is True
    assert payload["error_code"] == "AUDIO_TRANSCRIPTION_FAILED"


def test_failed_event_detail_from_parts() -> None:
    raw = failed_event_detail_from_parts(
        video_id="v",
        pipeline_stage="cv",
        retryable=False,
        error_code="CV_CUSTOM",
        message="x",
    )
    assert json.loads(raw)["error_code"] == "CV_CUSTOM"
