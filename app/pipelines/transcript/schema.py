"""
Pydantic models defining the JSON contract for the transcript column.

These schemas define exactly what gets stored in the ``transcript``
JSONB column in Supabase.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0"


# ── Word-level timestamp ─────────────────────────────────────

class WordTimestamp(BaseModel):
    """Single word with timing and confidence."""

    word: str
    start_sec: float
    end_sec: float
    confidence: Optional[float] = None


# ── Segment (utterance) ──────────────────────────────────────

class TranscriptSegment(BaseModel):
    """One Whisper segment — a natural utterance or sentence."""

    id: int
    start_sec: float
    end_sec: float
    text: str
    confidence: Optional[float] = None
    words: Optional[List[WordTimestamp]] = Field(
        default=None,
        description="Word-level timestamps. Omittable for storage savings.",
    )


# ── Summary statistics ───────────────────────────────────────

class TranscriptSummary(BaseModel):
    """High-level statistics about the transcript."""

    total_duration_sec: float
    total_words: int
    total_segments: int
    language_detected: str
    language_confidence: Optional[float] = None
    avg_words_per_segment: float


# ── Analysis parameters ─────────────────────────────────────

class TranscriptParams(BaseModel):
    """Parameters used for this transcription run."""

    model_size: str = "base"
    language: str = "tr"


# ── Top-level contract ───────────────────────────────────────

class TranscriptData(BaseModel):
    """
    Root schema for the ``transcript`` JSONB column.

    Serialize:  transcript.model_dump()
    Validate:   TranscriptData.model_validate(json_dict)
    """

    schema_version: str = SCHEMA_VERSION
    analysis_params: TranscriptParams
    summary: TranscriptSummary
    segments: List[TranscriptSegment] = Field(
        ..., description="Ordered list of all transcribed segments."
    )
