"""
Sound Pipeline Runner — top-level orchestrator.

Usage::

    from app.pipelines.sound.runner import run_sound_pipeline

    result = run_sound_pipeline(
        segment_id="abc-123",
        gcs_uri="gs://lectureai_processed/lecture_01/seg_0.mp4",
    )

This function:
1. Downloads the segment from GCS
2. Extracts audio (WAV)
3. Runs acoustic analysis (librosa + openSMILE + Praat)
4. Optionally uses Whisper timestamps for speech rate / pauses
5. Transforms raw output → SoundMetrics schema
6. Persists to Supabase (sound_metrics JSONB column)
7. Cleans up temp files
"""

from __future__ import annotations

import logging
from typing import Optional

from app.pipelines.common.audio_extractor import extract_audio
from app.pipelines.common.gcs import cleanup, download_segment
from app.pipelines.sound import adapter
from app.pipelines.sound.schema import SoundAnalysisParams, SoundMetrics

logger = logging.getLogger(__name__)


class SoundPipelineError(Exception):
    """Raised when the sound pipeline fails for a segment."""


def run_sound_pipeline(
    segment_id: str,
    gcs_uri: str,
    *,
    whisper_segments: list[dict] | None = None,
    window_sec: float = 10.0,
    hop_sec: float = 5.0,
    sample_rate: int = 22050,
    include_window_details: bool = True,
    persist: bool = True,
    supabase_client=None,
) -> SoundMetrics:
    """
    Run the full sound analysis pipeline for a single segment.

    Parameters
    ----------
    segment_id : str
        Unique identifier for the segment row in Supabase.
    gcs_uri : str
        GCS URI of the video segment.
    whisper_segments : list of dict, optional
        Pre-computed Whisper segments (from transcript pipeline).
        If provided, used for speech rate and pause analysis.
        If None, those metrics will be zero-valued — run transcript first.
    window_sec : float
        Analysis window size in seconds.
    hop_sec : float
        Hop between windows.
    sample_rate : int
        Audio sample rate for librosa.
    include_window_details : bool
        Include per-window metrics breakdown.
    persist : bool
        If True, write results to Supabase.
    supabase_client : optional
        Supabase client instance.

    Returns
    -------
    SoundMetrics
        The validated metrics object.
    """
    local_video: Optional[str] = None
    local_audio: Optional[str] = None

    params = SoundAnalysisParams(
        window_sec=window_sec,
        hop_sec=hop_sec,
        sample_rate=sample_rate,
    )

    try:
        # ── 1. Download ──────────────────────────────────────
        logger.info("[%s] Starting sound pipeline for %s", segment_id, gcs_uri)
        local_video = download_segment(gcs_uri, prefix="lectureai_sound_")

        # ── 2. Extract audio ─────────────────────────────────
        local_audio = extract_audio(
            local_video, sample_rate=sample_rate, mono=True
        )

        # ── 3. Run analysis ──────────────────────────────────
        raw = adapter.run_analysis(
            audio_path=local_audio,
            whisper_segments=whisper_segments,
            sample_rate=sample_rate,
        )

        # ── 4. Transform → schema ───────────────────────────
        metrics = adapter.transform(
            raw=raw,
            params=params,
            include_window_details=include_window_details,
        )

        # ── 5. Persist to Supabase ───────────────────────────
        if persist:
            _persist_to_supabase(
                segment_id=segment_id,
                metrics=metrics,
                client=supabase_client,
            )

        logger.info("[%s] Sound pipeline complete", segment_id)
        return metrics

    except Exception as exc:
        logger.exception("[%s] Sound pipeline failed: %s", segment_id, exc)
        raise SoundPipelineError(
            f"Sound pipeline failed for segment {segment_id}: {exc}"
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
    metrics: SoundMetrics,
    client=None,
) -> None:
    """Upsert sound_metrics JSON into the segment_results table."""
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
        "sound_metrics": metrics.model_dump(),
    }

    logger.info("[%s] Upserting sound_metrics to Supabase", segment_id)
    client.table("segment_results").upsert(payload).execute()
    logger.info("[%s] Persisted successfully", segment_id)
