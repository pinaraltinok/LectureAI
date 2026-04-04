"""
Pydantic models defining the JSON contract for visual_metrics.

These schemas define exactly what gets stored in the `visual_metrics`
JSONB column in Supabase.  The visual pipeline (video/) is never
modified — this module only describes the *output* format.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0"


# ── Per-frame detail (from debug_df) ─────────────────────────

class VisualFrameDetail(BaseModel):
    """One sampled frame's metrics snapshot."""

    t_sec: float = Field(..., description="Timestamp in the segment (seconds)")
    teacher_found: bool
    camera_open: bool = Field(
        ..., description="True if teacher's face was detected in the tile"
    )
    source: Optional[str] = Field(
        None, description="How the teacher was located: 'ocr' or 'tracking'"
    )
    smile_score: Optional[float] = None
    hands_detected: Optional[int] = None
    movement_energy: Optional[float] = None


# ── Aggregate summary ────────────────────────────────────────

class VisualSummary(BaseModel):
    """Aggregate ratios computed over all sampled frames."""

    frames_total_sampled: int
    teacher_located_frames: int
    camera_open_frames: int
    teacher_locate_ratio: float
    camera_open_ratio_total: float
    camera_open_ratio_among_located: float
    smile_frame_ratio: float
    hand_visible_ratio: float
    movement_energy_avg: float


# ── Analysis parameters (for reproducibility) ────────────────

class AnalysisParams(BaseModel):
    """Parameters that were used when running the visual pipeline."""

    analysis_interval_sec: float = 2.0
    relocalize_interval_sec: float = 10.0
    smile_threshold: float = 0.35


# ── Top-level contract ───────────────────────────────────────

class VisualMetrics(BaseModel):
    """
    Root schema for the `visual_metrics` JSONB column.

    Serialize with:  metrics.model_dump()
    Validate with:   VisualMetrics.model_validate(json_dict)
    """

    schema_version: str = SCHEMA_VERSION
    analysis_params: AnalysisParams
    summary: VisualSummary
    frame_details: Optional[List[VisualFrameDetail]] = Field(
        default=None,
        description=(
            "Per-frame breakdown (from debug_df).  "
            "Can be omitted in production to save storage."
        ),
    )
