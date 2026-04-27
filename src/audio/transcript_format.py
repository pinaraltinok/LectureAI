"""Human-readable and Gemini-oriented transcript formatting."""

from __future__ import annotations

from typing import List

from src.time_utils import ms_to_hms

from .schemas import TranscriptSegment


def speaker_display(speaker: str) -> str:
    label = (speaker or "?").strip()
    if len(label) == 1 and label.isalnum():
        return f"Konuşmacı {label.upper()}"
    low = label.lower()
    if low.startswith("speaker"):
        suffix = label.split(maxsplit=1)[-1] if " " in label else label
        return f"Konuşmacı {suffix}"
    return f"Konuşmacı {label}"


def format_transcript_txt_line(seg: TranscriptSegment) -> str:
    ts = ms_to_hms(seg.start_ms)
    sp = speaker_display(seg.speaker)
    sentiment = (seg.sentiment or "NEUTRAL").upper()
    conf = float(seg.sentiment_confidence)
    return (
        f"[{ts}] {sp}: {seg.text}  "
        f"(sentiment: {sentiment} {conf:.2f})"
    )


def build_transcript_txt(segments: List[TranscriptSegment]) -> str:
    ordered = sorted(segments, key=lambda s: s.start_ms)
    lines = [format_transcript_txt_line(s) for s in ordered]
    if not lines:
        return ""
    return "\n".join(lines) + "\n"


def format_segment_gemini_prompt(seg: TranscriptSegment) -> str:
    ts = ms_to_hms(seg.start_ms)
    sp = speaker_display(seg.speaker)
    sentiment = (seg.sentiment or "NEUTRAL").upper()
    conf = float(seg.sentiment_confidence)
    text = (seg.text or "").replace('"', '\\"')
    return f'[{ts}] {sp}: "{text}" ({sentiment} {conf:.2f})'


def build_formatted_transcript_for_prompt(
    segments: List[TranscriptSegment],
) -> str:
    ordered = sorted(segments, key=lambda s: s.start_ms)
    if not ordered:
        return ""
    return "\n".join(
        format_segment_gemini_prompt(s) for s in ordered
    )
