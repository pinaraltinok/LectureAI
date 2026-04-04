"""
Pydantic models defining the JSON contract for sound_metrics.

These schemas define exactly what gets stored in the ``sound_metrics``
JSONB column in Supabase.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0"


# ── Per-window detail ────────────────────────────────────────

class SoundWindowDetail(BaseModel):
    """Metrics for one analysis window (e.g. 10-second slice)."""

    start_sec: float
    end_sec: float
    pitch_mean_hz: Optional[float] = None
    energy_mean_db: Optional[float] = None
    speech_rate_syl_per_sec: Optional[float] = None
    pause_ratio: Optional[float] = None
    clarity_score: Optional[float] = None


# ── Aggregate summary ────────────────────────────────────────

class SoundSummary(BaseModel):
    """Aggregate paralinguistic metrics over the full segment."""

    duration_analyzed_sec: float = Field(
        ..., description="Total audio duration analyzed"
    )

    # Pitch
    pitch_mean_hz: float
    pitch_std_hz: float
    pitch_variation_coeff: float = Field(
        ..., description="pitch_std / pitch_mean — monotone vs. expressive"
    )

    # Energy
    energy_mean_db: float
    energy_std_db: float

    # Speech rate (from Whisper timestamps)
    speech_rate_syl_per_sec: float

    # Pauses (from Whisper segment gaps)
    pause_ratio: float = Field(
        ..., description="Fraction of total duration that is silence"
    )
    pause_count: int
    mean_pause_duration_sec: float

    # Emotion (from openSMILE eGeMAPSv02)
    emotional_tone: str = Field(
        ..., description="Categorical: neutral, positive, neutral-positive, negative"
    )
    emotional_confidence: float

    # Voice quality (from Praat)
    clarity_score: float = Field(
        ..., description="Composite 0–1 from HNR, jitter, shimmer"
    )

    # Composite
    child_friendly_score: float = Field(
        ..., description="Weighted avg of pitch variation, speech rate, clarity, pause quality"
    )


# ── Analysis parameters ─────────────────────────────────────

class SoundAnalysisParams(BaseModel):
    """Parameters used for this analysis run (reproducibility)."""

    window_sec: float = 10.0
    hop_sec: float = 5.0
    sample_rate: int = 22050


# ── Top-level contract ───────────────────────────────────────

class SoundMetrics(BaseModel):
    """
    Root schema for the ``sound_metrics`` JSONB column.

    Serialize:  metrics.model_dump()
    Validate:   SoundMetrics.model_validate(json_dict)
    """

    schema_version: str = SCHEMA_VERSION
    analysis_params: SoundAnalysisParams
    summary: SoundSummary
    window_details: Optional[List[SoundWindowDetail]] = Field(
        default=None,
        description="Per-window breakdown. Can be omitted for storage savings.",
    )
