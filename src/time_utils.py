"""Shared time formatting for transcripts and prompts."""

from __future__ import annotations


def ms_to_hms(ms: int) -> str:
    """Format milliseconds from track start as ``HH:MM:SS``."""
    ms = max(0, int(ms))
    total_sec, _ = divmod(ms, 1000)
    s = total_sec % 60
    total_min = total_sec // 60
    m = total_min % 60
    h = total_min // 60
    return f"{h:02d}:{m:02d}:{s:02d}"
