"""Unit tests for ``src.audio.assemblyai_client``.

All external dependencies (GCS + AssemblyAI) are mocked so tests can run
without credentials or network access.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

with patch("google.cloud.storage.Client"):
    from src.audio.assemblyai_client import (
        AudioAnalysisClient,
        AudioProcessingError,
    )
from src.audio.schemas import AudioAnalysisResult, SentimentSummary
from src.config import BucketConfig


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #
def _fake_transcript():
    """Return a SimpleNamespace shaped like ``aai.Transcript``."""
    utterances = [
        SimpleNamespace(speaker="A", start=0, end=2000, text="Hello class"),
        SimpleNamespace(
            speaker="A", start=2500, end=4500, text="today we learn math"
        ),
    ]
    sentiment_results = [
        SimpleNamespace(
            speaker="A",
            start=0,
            end=2000,
            text="Hello class",
            sentiment="POSITIVE",
            confidence=0.91,
        ),
        SimpleNamespace(
            speaker="A",
            start=2500,
            end=4500,
            text="today we learn math",
            sentiment="NEUTRAL",
            confidence=0.72,
        ),
    ]
    auto_highlights = SimpleNamespace(
        results=[SimpleNamespace(text="math"), SimpleNamespace(text="hello")]
    )
    return SimpleNamespace(
        id="tx-1",
        status="completed",
        text="Hello class today we learn math",
        utterances=utterances,
        sentiment_analysis_results=sentiment_results,
        auto_highlights_result=auto_highlights,
        audio_duration=5.0,
    )


def _bucket_config() -> BucketConfig:
    return BucketConfig(
        videos="lectureai_full_videos",
        processed="lectureai_processed",
        transcripts="lectureai_transcripts",
        audio="lectureai_audio",
        audio_chunks="lectureai_audio_chunks",
    )


def _make_client() -> AudioAnalysisClient:
    with patch("src.audio.assemblyai_client.storage.Client"):
        return AudioAnalysisClient(
            assemblyai_api_key="fake-key",
            buckets=_bucket_config(),
        )


def _install_bucket_router(client: AudioAnalysisClient):
    """Return a ``(buckets, blobs)`` pair where ``buckets[name]`` is the
    MagicMock used for that bucket name and ``blobs`` captures every
    ``blob.<name>`` ever requested, keyed by ``(bucket_name, blob_path)``."""
    buckets = {}
    blobs = {}

    def bucket_factory(name: str):
        if name not in buckets:
            bucket_mock = MagicMock(name=f"bucket:{name}")

            def blob_factory(path: str, _bucket_name=name):
                key = (_bucket_name, path)
                if key not in blobs:
                    blobs[key] = MagicMock(name=f"blob:{_bucket_name}/{path}")
                return blobs[key]

            bucket_mock.blob.side_effect = blob_factory
            buckets[name] = bucket_mock
        return buckets[name]

    client._storage_client = MagicMock()
    client._storage_client.bucket.side_effect = bucket_factory
    return buckets, blobs


def _ensure_blob(
    client: AudioAnalysisClient, bucket_name: str, object_key: str
) -> MagicMock:
    bucket = client._storage_client.bucket(bucket_name)
    return bucket.blob(object_key)

# --------------------------------------------------------------------------- #
#  Test 1 - happy path (MP4 download -> direct submit)
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_analyze_happy_path_direct_mp4_submit():
    client = _make_client()
    _buckets, blobs = _install_bucket_router(client)

    fake_tx = _fake_transcript()
    cache_blob = _ensure_blob(
        client, "lectureai_processed", "data/audio/video-123.json"
    )
    cache_blob.exists.return_value = False

    video_blob = _ensure_blob(
        client,
        "lectureai_full_videos",
        "Lesson_Records/video-123.mp4",
    )

    with patch("src.audio.assemblyai_client.aai.Transcriber") as mock_transcriber_cls, patch(
        "src.audio.assemblyai_client.aai.Transcript"
    ) as mock_transcript_cls, patch(
        "src.audio.assemblyai_client.aai.TranscriptStatus"
    ) as mock_status:
        mock_status.completed = "completed"
        mock_status.error = "error"

        transcriber_instance = mock_transcriber_cls.return_value
        transcriber_instance.submit.return_value = SimpleNamespace(id="tx-1")
        mock_transcript_cls.get_by_id.return_value = fake_tx

        result = await client.analyze("video-123")

    assert isinstance(result, AudioAnalysisResult)
    assert result.video_id == "video-123"
    assert result.full_transcript == "Hello class today we learn math"
    assert len(result.segments) == 2
    assert result.segments[0].sentiment == "POSITIVE"
    assert result.highlights == ["math", "hello"]
    assert result.speaking_pace_wpm == pytest.approx(72.0, rel=1e-2)
    assert result.silence_ratio == pytest.approx(0.2, abs=1e-3)
    assert isinstance(result.sentiment_summary, SentimentSummary)
    assert result.sentiment_summary.positive_ratio == pytest.approx(0.5)

    video_blob.download_to_filename.assert_called_once()
    transcriber_instance.submit.assert_called_once()
    media_arg = transcriber_instance.submit.call_args.args[0]
    assert isinstance(media_arg, str)
    assert media_arg.endswith(".mp4")

    json_blob = blobs[("lectureai_processed", "data/audio/video-123.json")]
    txt_blob = blobs[("lectureai_processed", "transcripts/video-123.txt")]
    assert json_blob.upload_from_string.called
    assert txt_blob.upload_from_string.called
    uploaded_txt = txt_blob.upload_from_string.call_args.args[0]
    assert "[00:00:00]" in uploaded_txt
    assert "Speaker A:" in uploaded_txt
    assert "sentiment: POSITIVE" in uploaded_txt

    mock_transcript_cls.get_by_id.assert_called_once_with("tx-1")


# --------------------------------------------------------------------------- #
#  Test 2 - AssemblyAI error -> AudioProcessingError
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_analyze_transcription_error_raises():
    client = _make_client()
    _buckets, blobs = _install_bucket_router(client)

    error_tx = SimpleNamespace(
        id="tx-err",
        status="error",
        error="simulated AAI failure",
        text=None,
        utterances=[],
        sentiment_analysis_results=[],
        auto_highlights_result=None,
        audio_duration=0,
    )

    cache_blob = _ensure_blob(
        client, "lectureai_processed", "data/audio/video-err.json"
    )
    cache_blob.exists.return_value = False

    video_blob = _ensure_blob(
        client,
        "lectureai_full_videos",
        "Lesson_Records/video-err.mp4",
    )

    with patch("src.audio.assemblyai_client.aai.Transcriber") as mock_transcriber_cls, patch(
        "src.audio.assemblyai_client.aai.Transcript"
    ) as mock_transcript_cls, patch(
        "src.audio.assemblyai_client.aai.TranscriptStatus"
    ) as mock_status:
        mock_status.completed = "completed"
        mock_status.error = "error"
        mock_transcriber_cls.return_value.submit.return_value = (
            SimpleNamespace(id="tx-err")
        )
        mock_transcript_cls.get_by_id.return_value = error_tx

        with pytest.raises(AudioProcessingError) as excinfo:
            await client.analyze("video-err")

    assert excinfo.value.stage == "transcription"
    assert excinfo.value.video_id == "video-err"
    assert "simulated AAI failure" in str(excinfo.value)

    json_key = ("lectureai_processed", "data/audio/video-err.json")
    assert (
        json_key not in blobs
        or not blobs[json_key].upload_from_string.called
    )


@pytest.mark.asyncio
async def test_analyze_cache_hit_skips_download_and_transcription():
    client = _make_client()
    _, blobs = _install_bucket_router(client)

    cached = AudioAnalysisResult(
        video_id="video-cache",
        full_transcript="cached transcript",
        segments=[],
        highlights=["cached"],
        speaking_pace_wpm=130.0,
        silence_ratio=0.1,
        sentiment_summary=SentimentSummary.empty(),
        processed_at=datetime.now(tz=timezone.utc),
    )
    cached_payload = cached.model_dump_json()
    cache_blob = _ensure_blob(
        client, "lectureai_processed", "data/audio/video-cache.json"
    )
    cache_blob.exists.return_value = True
    cache_blob.download_as_text.return_value = cached_payload

    result = await client.analyze("video-cache")

    assert result.video_id == "video-cache"
    assert result.full_transcript == "cached transcript"

    assert (
        "lectureai_full_videos",
        "Lesson_Records/video-cache.mp4",
    ) not in blobs
