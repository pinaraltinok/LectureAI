"""
Adapter: bridge between the transcript pipeline runner and Whisper.

This module handles:
- Audio extraction (via shared utility)
- Whisper transcription with word-level timestamps
- Transformation to the TranscriptData schema
"""

from __future__ import annotations

import logging
from typing import Optional

from app.pipelines.common.audio_extractor import extract_audio
from app.pipelines.common.gcs import cleanup, download_segment
from app.pipelines.transcript.schema import (
    TranscriptData,
    TranscriptParams,
    TranscriptSegment,
    TranscriptSummary,
    WordTimestamp,
)

logger = logging.getLogger(__name__)


# ── Whisper transcription ────────────────────────────────────

def run_analysis(
    audio_path: str,
    model_size: str = "base",
    language: str = "tr",
) -> dict:
    """
    Transcribe an audio file using OpenAI Whisper.

    Parameters
    ----------
    audio_path : str
        Path to the WAV file (16kHz mono recommended).
    model_size : str
        Whisper model size: 'tiny', 'base', 'small', 'medium', 'large'.
    language : str
        Language code for transcription.

    Returns
    -------
    dict
        Raw Whisper result dict with 'text', 'segments', 'language'.
    """
    import whisper

    logger.info(
        "Loading Whisper model '%s' for language '%s'",
        model_size, language,
    )
    model = whisper.load_model(model_size)

    logger.info("Transcribing %s", audio_path)
    result = model.transcribe(
        audio_path,
        language=language,
        word_timestamps=True,
        verbose=False,
    )

    seg_count = len(result.get("segments", []))
    logger.info(
        "Transcription complete: %d segments, detected language '%s'",
        seg_count, result.get("language", "unknown"),
    )
    return result


# ── Transform raw output → schema ────────────────────────────

def transform(
    raw: dict,
    params: TranscriptParams,
    include_word_timestamps: bool = True,
) -> TranscriptData:
    """
    Convert raw Whisper output into the canonical ``TranscriptData`` schema.
    """
    raw_segments = raw.get("segments", [])
    detected_lang = raw.get("language", params.language)

    # Build segment list
    segments = []
    total_words = 0

    for seg in raw_segments:
        # Word-level timestamps
        words = None
        seg_word_count = len(seg.get("text", "").split())
        total_words += seg_word_count

        if include_word_timestamps and seg.get("words"):
            words = [
                WordTimestamp(
                    word=w.get("word", "").strip(),
                    start_sec=round(w["start"], 3),
                    end_sec=round(w["end"], 3),
                    confidence=round(w.get("probability", 0.0), 3)
                    if w.get("probability") is not None else None,
                )
                for w in seg["words"]
                if w.get("word", "").strip()
            ]

        segments.append(
            TranscriptSegment(
                id=seg.get("id", len(segments)),
                start_sec=round(seg["start"], 3),
                end_sec=round(seg["end"], 3),
                text=seg.get("text", "").strip(),
                confidence=round(seg.get("avg_logprob", 0.0), 3)
                if seg.get("avg_logprob") is not None else None,
                words=words,
            )
        )

    # Compute summary
    total_duration = 0.0
    if segments:
        total_duration = segments[-1].end_sec - segments[0].start_sec

    avg_words = (total_words / len(segments)) if segments else 0.0

    summary = TranscriptSummary(
        total_duration_sec=round(total_duration, 2),
        total_words=total_words,
        total_segments=len(segments),
        language_detected=detected_lang,
        language_confidence=None,  # Whisper doesn't expose this directly
        avg_words_per_segment=round(avg_words, 1),
    )

    return TranscriptData(
        analysis_params=params,
        summary=summary,
        segments=segments,
    )


def get_whisper_segments_for_sound(raw: dict) -> list[dict]:
    """
    Extract minimal segment data from Whisper results for the sound pipeline.

    Returns a list of dicts with 'start', 'end', 'text' keys —
    exactly what ``sound/adapter._analyze_speech_rate_and_pauses()`` expects.
    """
    return [
        {
            "start": seg["start"],
            "end": seg["end"],
            "text": seg.get("text", ""),
        }
        for seg in raw.get("segments", [])
    ]
