from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from src.audio.schemas import AudioAnalysisResult, TranscriptSegment

_STOPWORDS = {
    "teacher",
    "student",
    "host",
    "zoom",
    "meeting",
    "ders",
    "lesson",
    "camera",
    "chat",
}


@dataclass
class NameMappingResult:
    speaker_to_name: Dict[str, str]
    confidence_by_speaker: Dict[str, float]
    evidence: List[Dict[str, Any]]


def _normalise_text(value: str) -> str:
    return " ".join(value.strip().split())


def _extract_ts_sec(item: Any) -> Optional[float]:
    if isinstance(item, dict):
        for key in ("timestamp_sec", "time_sec", "t_sec", "second", "sec"):
            v = item.get(key)
            if isinstance(v, (int, float)):
                return float(v)
        for key in ("timestamp_ms", "time_ms", "t_ms"):
            v = item.get(key)
            if isinstance(v, (int, float)):
                return float(v) / 1000.0
    return None


def _iter_text_candidates(payload: Any) -> Iterable[Tuple[Optional[float], str]]:
    if isinstance(payload, dict):
        ts = _extract_ts_sec(payload)
        for key, value in payload.items():
            if isinstance(value, str) and key.lower() in {
                "text",
                "label_text",
                "name",
                "student_name",
            }:
                yield ts, value
            else:
                for nested_ts, nested_text in _iter_text_candidates(value):
                    yield (nested_ts if nested_ts is not None else ts), nested_text
    elif isinstance(payload, list):
        for item in payload:
            yield from _iter_text_candidates(item)


def _extract_name_candidates(text: str) -> List[str]:
    text = _normalise_text(text)
    if not text:
        return []
    # Simple OCR-safe matcher: at least two alphabetic words.
    parts = re.findall(r"[A-Za-zÇĞİÖŞÜçğıöşü]{2,}", text)
    if len(parts) < 2:
        return []
    lowered = [p.lower() for p in parts]
    if any(p in _STOPWORDS for p in lowered):
        return []
    candidate = " ".join(parts[:3])
    return [candidate]


def build_name_mapping_for_first_window(
    *,
    cv_data: Dict[str, Any],
    audio_result: AudioAnalysisResult,
    window_sec: int = 600,
) -> NameMappingResult:
    """Map diarization speakers to OCR-derived name candidates."""
    speaker_durations: Counter[str] = Counter()
    for seg in audio_result.segments:
        if seg.start_ms >= window_sec * 1000:
            continue
        speaker_durations[seg.speaker] += max(0, seg.end_ms - seg.start_ms)

    name_counter: Counter[str] = Counter()
    evidence: List[Dict[str, Any]] = []
    for ts, text in _iter_text_candidates(cv_data):
        if ts is not None and ts > window_sec:
            continue
        for candidate in _extract_name_candidates(text):
            name_counter[candidate] += 1
            evidence.append(
                {
                    "timestamp_sec": ts,
                    "raw_text": text,
                    "name_candidate": candidate,
                }
            )

    speakers = [s for s, _ in speaker_durations.most_common()]
    names = [n for n, _ in name_counter.most_common()]

    speaker_to_name: Dict[str, str] = {}
    confidence: Dict[str, float] = {}
    if not speakers:
        return NameMappingResult(speaker_to_name, confidence, evidence)

    for idx, speaker in enumerate(speakers):
        if idx < len(names):
            selected = names[idx]
            speaker_to_name[speaker] = selected
            confidence[speaker] = min(0.95, 0.5 + 0.1 * name_counter[selected])
        else:
            speaker_to_name[speaker] = f"Student_{idx + 1:02d}"
            confidence[speaker] = 0.3
    return NameMappingResult(speaker_to_name, confidence, evidence)


def remap_audio_speakers(
    audio_result: AudioAnalysisResult,
    speaker_to_name: Dict[str, str],
) -> AudioAnalysisResult:
    mapped_segments: List[TranscriptSegment] = []
    for seg in audio_result.segments:
        mapped_segments.append(
            seg.model_copy(
                update={"speaker": speaker_to_name.get(seg.speaker, seg.speaker)}
            )
        )
    return audio_result.model_copy(update={"segments": mapped_segments})
