"""
Pydantic models defining the JSON contract for the transcript column.

These schemas define exactly what gets stored in the ``transcript``
JSONB column in Supabase.  Includes speaker diarization support.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = "2.0"


# ── Word-level timestamp ─────────────────────────────────────

class WordTimestamp(BaseModel):
    """Single word with timing, confidence, and speaker."""

    word: str
    start_sec: float
    end_sec: float
    confidence: Optional[float] = None
    speaker: Optional[str] = Field(
        None, description="Speaker label, e.g. 'SPEAKER_00', 'SPEAKER_01'"
    )


# ── Segment (utterance) ──────────────────────────────────────

class TranscriptSegment(BaseModel):
    """One utterance — a natural sentence with speaker label."""

    id: int
    start_sec: float
    end_sec: float
    text: str
    speaker: Optional[str] = Field(
        None, description="Speaker label assigned by diarization"
    )
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
    num_speakers: Optional[int] = Field(
        None, description="Number of distinct speakers detected"
    )
    speakers: Optional[List[str]] = Field(
        None, description="List of speaker labels found"
    )


# ── Analysis parameters ─────────────────────────────────────

class TranscriptParams(BaseModel):
    """Parameters used for this transcription run."""

    model_size: str = "medium"
    language: str = "tr"
    diarization_enabled: bool = True


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
