"""
Visual Pipeline Runner — top-level orchestrator.

Usage::

    from app.pipelines.visual.runner import run_visual_pipeline

    result = run_visual_pipeline(
        segment_id="abc-123",
        gcs_uri="gs://lectureai_processed/lecture_01/seg_0.mp4",
        teacher_name="Prof. Altınok",
    )

This function:
1. Downloads the segment from GCS
2. Runs the visual pipeline (black box)
3. Transforms raw output → VisualMetrics schema
4. Persists to Supabase (visual_metrics JSONB column)
5. Cleans up temp files
"""

from __future__ import annotations

import logging
from typing import Optional

from app.pipelines.visual import adapter
from app.pipelines.visual.schema import AnalysisParams, VisualMetrics

logger = logging.getLogger(__name__)


class VisualPipelineError(Exception):
    """Raised when the visual pipeline fails for a segment."""


def run_visual_pipeline(
    segment_id: str,
    gcs_uri: str,
    teacher_name: str,
    *,
    analysis_interval_sec: float = 2.0,
    relocalize_interval_sec: float = 10.0,
    smile_threshold: float = 0.35,
    start_sec: float = 0.0,
    end_sec: Optional[float] = None,
    include_frame_details: bool = True,
    persist: bool = True,
    supabase_client=None,
) -> VisualMetrics:
    """
    Run the full visual analysis pipeline for a single segment.

    Parameters
    ----------
    segment_id : str
        Unique identifier for the segment row in Supabase.
    gcs_uri : str
        GCS URI of the video segment (gs://bucket/blob).
    teacher_name : str
        Name of the teacher (used for OCR tile matching).
    analysis_interval_sec : float
        How often to sample frames (seconds).
    relocalize_interval_sec : float
        How often to re-run OCR localization (seconds).
    smile_threshold : float
        Minimum smile_score to count as "smiling".
    start_sec : float
        Start processing from this time offset.
    end_sec : float, optional
        Stop processing at this time offset.
    include_frame_details : bool
        Include per-frame breakdown in the output.
    persist : bool
        If True, write results to Supabase.
    supabase_client : optional
        Supabase client instance.  If None and persist=True,
        a default client is created from environment variables.

    Returns
    -------
    VisualMetrics
        The validated metrics object (also persisted if persist=True).

    Raises
    ------
    VisualPipelineError
        If the pipeline fails for any reason.
    """
    local_path: Optional[str] = None
    params = AnalysisParams(
        analysis_interval_sec=analysis_interval_sec,
        relocalize_interval_sec=relocalize_interval_sec,
        smile_threshold=smile_threshold,
    )

    try:
        # ── 1. Download ──────────────────────────────────────
        logger.info("[%s] Starting visual pipeline for %s", segment_id, gcs_uri)
        local_path = adapter.download_segment(gcs_uri)

        # ── 2. Run analysis ──────────────────────────────────
        raw_summary, raw_debug_df = adapter.run_analysis(
            video_path=local_path,
            teacher_name=teacher_name,
            analysis_interval_sec=analysis_interval_sec,
            relocalize_interval_sec=relocalize_interval_sec,
            smile_threshold=smile_threshold,
            start_sec=start_sec,
            end_sec=end_sec,
        )

        # ── 3. Transform → schema ───────────────────────────
        metrics = adapter.transform(
            raw_summary=raw_summary,
            raw_debug_df=raw_debug_df,
            params=params,
            include_frame_details=include_frame_details,
        )

        # ── 4. Persist to Supabase ───────────────────────────
        if persist:
            _persist_to_supabase(
                segment_id=segment_id,
                metrics=metrics,
                client=supabase_client,
            )

        logger.info("[%s] Visual pipeline complete", segment_id)
        return metrics

    except Exception as exc:
        logger.exception("[%s] Visual pipeline failed: %s", segment_id, exc)
        raise VisualPipelineError(
            f"Visual pipeline failed for segment {segment_id}: {exc}"
        ) from exc

    finally:
        # ── 5. Cleanup ───────────────────────────────────────
        if local_path is not None:
            adapter.cleanup(local_path)


# ── Supabase persistence ─────────────────────────────────────

def _persist_to_supabase(
    segment_id: str,
    metrics: VisualMetrics,
    client=None,
) -> None:
    """
    Upsert the visual_metrics JSON into the segment_results table.

    If no client is provided, one is created from the
    SUPABASE_URL and SUPABASE_KEY environment variables.
    """
    import os

    if client is None:
        try:
            from supabase import create_client
        except ImportError:
            logger.warning(
                "[%s] supabase-py not installed — skipping persistence. "
                "Install with: pip install supabase",
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
        "visual_metrics": metrics.model_dump(),
    }

    logger.info("[%s] Upserting visual_metrics to Supabase", segment_id)
    client.table("segment_results").upsert(payload).execute()
    logger.info("[%s] Persisted successfully", segment_id)
