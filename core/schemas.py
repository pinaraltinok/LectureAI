"""Pydantic v2 schemas for the audio analysis module."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field

from src.time_utils import ms_to_hms


class TranscriptSegment(BaseModel):
    """A single diarised transcript segment with sentiment."""

    speaker: str = Field(..., description="Speaker label, e.g. 'A', 'B'.")
    start_ms: int = Field(..., ge=0, description="Segment start in milliseconds.")
    end_ms: int = Field(..., ge=0, description="Segment end in milliseconds.")
    text: str = Field(..., description="Transcribed text for this segment.")
    sentiment: str = Field(
        ...,
        description="Sentiment label: POSITIVE | NEUTRAL | NEGATIVE.",
    )
    sentiment_confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model confidence for the sentiment label.",
    )


class SentimentSummary(BaseModel):
    """Aggregate sentiment statistics over all segments."""

    positive_ratio: float = Field(
        ..., ge=0.0, le=1.0, description="Fraction of segments labelled POSITIVE."
    )
    neutral_ratio: float = Field(
        ..., ge=0.0, le=1.0, description="Fraction of segments labelled NEUTRAL."
    )
    negative_ratio: float = Field(
        ..., ge=0.0, le=1.0, description="Fraction of segments labelled NEGATIVE."
    )
    avg_positive_confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Mean confidence among POSITIVE segments (0 if none).",
    )
    avg_negative_confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Mean confidence among NEGATIVE segments (0 if none).",
    )
    most_negative_moments: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Up to 3 strongest negative moments (timestamp + text).",
    )
    most_positive_moments: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Up to 3 strongest positive moments (timestamp + text).",
    )
    sentiment_trend: Literal["improving", "declining", "stable"] = Field(
        ...,
        description="First vs second half positivity comparison.",
    )

    @classmethod
    def empty(cls) -> "SentimentSummary":
        return cls(
            positive_ratio=0.0,
            neutral_ratio=0.0,
            negative_ratio=0.0,
            avg_positive_confidence=0.0,
            avg_negative_confidence=0.0,
            most_negative_moments=[],
            most_positive_moments=[],
            sentiment_trend="stable",
        )


def build_sentiment_summary(
    segments: List[TranscriptSegment],
) -> SentimentSummary:
    """Compute ``SentimentSummary`` from diarised segments."""
    if not segments:
        return SentimentSummary.empty()

    ordered = sorted(segments, key=lambda s: s.start_ms)
    n = len(ordered)
    pos_n = neg_n = neu_n = 0
    pos_conf_sum = 0.0
    neg_conf_sum = 0.0
    pos_count = neg_count = 0

    for seg in ordered:
        lab = (seg.sentiment or "NEUTRAL").upper()
        c = float(seg.sentiment_confidence)
        if lab == "POSITIVE":
            pos_n += 1
            pos_conf_sum += c
            pos_count += 1
        elif lab == "NEGATIVE":
            neg_n += 1
            neg_conf_sum += c
            neg_count += 1
        else:
            neu_n += 1

    def _moment_dict(seg: TranscriptSegment) -> Dict[str, Any]:
        return {
            "start_ms": seg.start_ms,
            "timestamp_hms": ms_to_hms(seg.start_ms),
            "speaker": seg.speaker,
            "text": seg.text,
            "sentiment": (seg.sentiment or "NEUTRAL").upper(),
            "confidence": float(seg.sentiment_confidence),
        }

    def _valence(seg: TranscriptSegment) -> float:
        lab = (seg.sentiment or "NEUTRAL").upper()
        c = float(seg.sentiment_confidence)
        if lab == "POSITIVE":
            return c
        if lab == "NEGATIVE":
            return -c
        return 0.0

    by_valence_asc = sorted(ordered, key=_valence)
    most_neg = [_moment_dict(s) for s in by_valence_asc[:3]]
    by_valence_desc = sorted(ordered, key=_valence, reverse=True)
    most_pos = [_moment_dict(s) for s in by_valence_desc[:3]]

    # Positivity ratio: share of POSITIVE labels
    half = n // 2
    first = ordered[:half] if half else ordered
    second = ordered[half:] if half else ordered

    def _pos_ratio(segs: List[TranscriptSegment]) -> float:
        if not segs:
            return 0.0
        pn = sum(
            1
            for s in segs
            if (s.sentiment or "NEUTRAL").upper() == "POSITIVE"
        )
        return pn / len(segs)

    r1 = _pos_ratio(first)
    r2 = _pos_ratio(second)
    eps = 0.05
    if r2 > r1 + eps:
        trend: Literal["improving", "declining", "stable"] = "improving"
    elif r2 < r1 - eps:
        trend = "declining"
    else:
        trend = "stable"

    return SentimentSummary(
        positive_ratio=round(pos_n / n, 4),
        neutral_ratio=round(neu_n / n, 4),
        negative_ratio=round(neg_n / n, 4),
        avg_positive_confidence=round(
            pos_conf_sum / pos_count if pos_count else 0.0,
            4,
        ),
        avg_negative_confidence=round(
            neg_conf_sum / neg_count if neg_count else 0.0,
            4,
        ),
        most_negative_moments=most_neg,
        most_positive_moments=most_pos,
        sentiment_trend=trend,
    )


class AudioAnalysisResult(BaseModel):
    """Result of transcribing + analysing an audio track."""

    video_id: str
    full_transcript: str
    segments: List[TranscriptSegment]
    highlights: List[str]
    speaking_pace_wpm: float = Field(
        ..., description="Words per minute across the entire lecture."
    )
    silence_ratio: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Fraction of total duration that is silence/gaps.",
    )
    sentiment_summary: SentimentSummary = Field(
        default_factory=SentimentSummary.empty,
        description="Aggregate sentiment statistics and notable moments.",
    )
    processed_at: datetime
