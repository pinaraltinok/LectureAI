"""
Adapter: thin bridge between the integration layer and the black-box
``video/`` pipeline.

This module is the ONLY place that imports from ``video/``.
It handles download, invocation, output transformation, and cleanup.
Nothing inside ``video/`` is modified.
"""

from __future__ import annotations

import logging
import os
import tempfile
from typing import Optional

from google.cloud import storage

from video.dynamic_visual_pipeline import run_dynamic_visual_poc

from app.pipelines.visual.schema import (
    AnalysisParams,
    VisualFrameDetail,
    VisualMetrics,
    VisualSummary,
)

logger = logging.getLogger(__name__)


# ── GCS download ─────────────────────────────────────────────

def download_segment(gcs_uri: str, dest_dir: Optional[str] = None) -> str:
    """
    Download a GCS object to a local temp file and return its path.

    Parameters
    ----------
    gcs_uri : str
        ``gs://bucket/path/to/seg_0.mp4``
    dest_dir : str, optional
        Directory to download into.  Defaults to a new temp directory.

    Returns
    -------
    str
        Absolute path to the downloaded file.
    """
    if not gcs_uri.startswith("gs://"):
        raise ValueError(f"Invalid GCS URI: {gcs_uri}")

    without_scheme = gcs_uri[len("gs://"):]
    bucket_name, blob_name = without_scheme.split("/", 1)

    if dest_dir is None:
        dest_dir = tempfile.mkdtemp(prefix="lectureai_visual_")

    local_path = os.path.join(dest_dir, os.path.basename(blob_name))

    logger.info("Downloading %s → %s", gcs_uri, local_path)
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.download_to_filename(local_path)
    logger.info("Download complete: %s (%.1f MiB)", local_path, os.path.getsize(local_path) / (1024 * 1024))

    return local_path


# ── Run the black-box pipeline ───────────────────────────────

def run_analysis(
    video_path: str,
    teacher_name: str,
    analysis_interval_sec: float = 2.0,
    relocalize_interval_sec: float = 10.0,
    smile_threshold: float = 0.35,
    start_sec: float = 0.0,
    end_sec: Optional[float] = None,
) -> tuple[dict, "pd.DataFrame"]:
    """
    Call the existing visual pipeline and return its raw outputs.

    Returns
    -------
    (summary_dict, debug_dataframe)
    """
    import pandas as pd  # noqa: F811 — deferred import to keep module light

    logger.info(
        "Running visual analysis: video=%s teacher=%s interval=%.1fs",
        video_path, teacher_name, analysis_interval_sec,
    )

    summary, debug_df = run_dynamic_visual_poc(
        video_path=video_path,
        teacher_name=teacher_name,
        analysis_interval_sec=analysis_interval_sec,
        relocalize_interval_sec=relocalize_interval_sec,
        smile_threshold=smile_threshold,
        start_sec=start_sec,
        end_sec=end_sec,
    )

    logger.info(
        "Visual analysis complete: %d frames sampled, %d located",
        summary.get("frames_total_sampled", 0),
        summary.get("teacher_located_frames", 0),
    )

    return summary, debug_df


# ── Transform raw output → schema ────────────────────────────

def transform(
    raw_summary: dict,
    raw_debug_df: "pd.DataFrame",
    params: AnalysisParams,
    include_frame_details: bool = True,
) -> VisualMetrics:
    """
    Convert the raw pipeline output into the canonical ``VisualMetrics`` schema.

    Parameters
    ----------
    raw_summary : dict
        The ``summary`` dict returned by ``run_dynamic_visual_poc``.
    raw_debug_df : pandas.DataFrame
        The ``debug_df`` DataFrame returned by ``run_dynamic_visual_poc``.
    params : AnalysisParams
        The parameters that were used for analysis.
    include_frame_details : bool
        If False, the per-frame breakdown is omitted (saves storage).
    """
    summary = VisualSummary(
        frames_total_sampled=raw_summary["frames_total_sampled"],
        teacher_located_frames=raw_summary["teacher_located_frames"],
        camera_open_frames=raw_summary["camera_open_frames"],
        teacher_locate_ratio=raw_summary["teacher_locate_ratio"],
        camera_open_ratio_total=raw_summary["camera_open_ratio_total"],
        camera_open_ratio_among_located=raw_summary["camera_open_ratio_among_located"],
        smile_frame_ratio=raw_summary["smile_frame_ratio"],
        hand_visible_ratio=raw_summary["hand_visible_ratio"],
        movement_energy_avg=raw_summary["movement_energy_avg"],
    )

    frame_details = None
    if include_frame_details and not raw_debug_df.empty:
        frame_details = [
            VisualFrameDetail(
                t_sec=row["t_sec"],
                teacher_found=bool(row.get("teacher_found", False)),
                camera_open=bool(row.get("camera_open_frame", False)),
                source=row.get("source"),
                smile_score=row.get("smile_score"),
                hands_detected=(
                    int(row["hands_detected"])
                    if row.get("hands_detected") is not None
                    else None
                ),
                movement_energy=row.get("movement_energy"),
            )
            for _, row in raw_debug_df.iterrows()
        ]

    return VisualMetrics(
        analysis_params=params,
        summary=summary,
        frame_details=frame_details,
    )


# ── Cleanup ──────────────────────────────────────────────────

def cleanup(local_path: str) -> None:
    """Remove the locally downloaded segment file and its parent temp dir."""
    try:
        if os.path.isfile(local_path):
            parent = os.path.dirname(local_path)
            os.remove(local_path)
            logger.info("Removed temp file: %s", local_path)

            # Remove the temp dir if it is now empty
            if parent and parent != os.getcwd() and not os.listdir(parent):
                os.rmdir(parent)
                logger.info("Removed empty temp dir: %s", parent)
    except OSError as exc:
        logger.warning("Cleanup failed for %s: %s", local_path, exc)
