"""
Transcript Pipeline Runner — top-level orchestrator.

Usage::

    from app.pipelines.transcript.runner import run_transcript_pipeline

    result = run_transcript_pipeline(
        segment_id="abc-123",
        gcs_uri="gs://lectureai_processed/lecture_01/seg_0.mp4",
    )

This function:
1. Downloads the segment from GCS
2. Extracts audio (16kHz mono WAV for Whisper)
3. Runs Whisper transcription
4. Transforms raw output → TranscriptData schema
5. Persists to Supabase (transcript JSONB column)
6. Cleans up temp files
"""

from __future__ import annotations

import logging
from typing import Optional

from app.pipelines.common.audio_extractor import extract_audio
from app.pipelines.common.gcs import cleanup, download_segment
from app.pipelines.transcript import adapter
from app.pipelines.transcript.schema import TranscriptData, TranscriptParams

logger = logging.getLogger(__name__)

WHISPER_SAMPLE_RATE = 16000  # Whisper expects 16kHz


class TranscriptPipelineError(Exception):
    """Raised when the transcript pipeline fails for a segment."""


def run_transcript_pipeline(
    segment_id: str,
    gcs_uri: str,
    *,
    model_size: str = "base",
    language: str = "tr",
    include_word_timestamps: bool = True,
    persist: bool = True,
    supabase_client=None,
) -> TranscriptData:
    """
    Run the full transcript pipeline for a single segment.

    Parameters
    ----------
    segment_id : str
        Unique identifier for the segment row in Supabase.
    gcs_uri : str
        GCS URI of the video segment.
    model_size : str
        Whisper model size.
    language : str
        Language code for transcription.
    include_word_timestamps : bool
        Include word-level timestamps in the output.
    persist : bool
        If True, write results to Supabase.
    supabase_client : optional
        Supabase client instance.

    Returns
    -------
    TranscriptData
        The validated transcript object.
    """
    local_video: Optional[str] = None
    local_audio: Optional[str] = None

    params = TranscriptParams(
        model_size=model_size,
        language=language,
    )

    try:
        # ── 1. Download ──────────────────────────────────────
        logger.info("[%s] Starting transcript pipeline for %s", segment_id, gcs_uri)
        local_video = download_segment(gcs_uri, prefix="lectureai_transcript_")

        # ── 2. Extract audio (16kHz for Whisper) ─────────────
        local_audio = extract_audio(
            local_video, sample_rate=WHISPER_SAMPLE_RATE, mono=True
        )

        # ── 3. Transcribe ────────────────────────────────────
        raw = adapter.run_analysis(
            audio_path=local_audio,
            model_size=model_size,
            language=language,
        )

        # ── 4. Transform → schema ───────────────────────────
        transcript = adapter.transform(
            raw=raw,
            params=params,
            include_word_timestamps=include_word_timestamps,
        )

        # ── 5. Persist to Supabase ───────────────────────────
        if persist:
            _persist_to_supabase(
                segment_id=segment_id,
                transcript=transcript,
                client=supabase_client,
            )

        logger.info("[%s] Transcript pipeline complete", segment_id)
        return transcript

    except Exception as exc:
        logger.exception("[%s] Transcript pipeline failed: %s", segment_id, exc)
        raise TranscriptPipelineError(
            f"Transcript pipeline failed for segment {segment_id}: {exc}"
        ) from exc

    finally:
        # ── 6. Cleanup ───────────────────────────────────────
        files_to_clean = [
            p for p in [local_audio, local_video] if p is not None
        ]
        if files_to_clean:
            cleanup(*files_to_clean)


# ── Supabase persistence ─────────────────────────────────────

def _persist_to_supabase(
    segment_id: str,
    transcript: TranscriptData,
    client=None,
) -> None:
    """Upsert transcript JSON into the segment_results table."""
    import os

    if client is None:
        try:
            from supabase import create_client
        except ImportError:
            logger.warning(
                "[%s] supabase-py not installed — skipping persistence.",
                segment_id,
            )
            return

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")

        if not url or not key:
            logger.warning(
                "[%s] SUPABASE_URL / SUPABASE_KEY not set — skipping persistence",
                segment_id,
            )
            return

        client = create_client(url, key)

    payload = {
        "segment_id": segment_id,
        "transcript": transcript.model_dump(),
    }

    logger.info("[%s] Upserting transcript to Supabase", segment_id)
    client.table("segment_results").upsert(payload).execute()
    logger.info("[%s] Persisted successfully", segment_id)
