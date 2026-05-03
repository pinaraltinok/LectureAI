"""LLM-backed orchestrator that produces the final QAReport.

Pipeline:

    1. Load CV JSON from the processed bucket (prefer
       ``results/{video_id}/lecture_report.json``, then ``GCS_KEY_CV`` template)
    2. Chunk audio + CV data into ``chunk_minutes`` windows
    3. Analyse every chunk with the configured LLM provider chain in parallel
    4. Merge chunk analyses into a single QAReport (same provider chain)
    5. Upload the QAReport JSON to
       ``gs://{bucket}/data/reports/{video_id}.json`` and return it.

Providers (``ORCHESTRATOR_PROVIDER_ORDER``): ``openrouter``, ``aistudio``, ``vertex``, ``groq``.
Legacy token ``gemini`` expands from ``GEMINI_PROVIDER`` (vertex vs AI Studio).
Optional ``ORCHESTRATOR_DEGRADED_FALLBACK`` emits a CV+audio template report
when all chunk LLMs fail or merge fails after chunks succeeded.
Optional ``ORCHESTRATOR_LLM_SPACING_SEC`` adds a short pause after each successful
LLM call to reduce RPM bursts (helps with 429 "too many requests").
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import unicodedata
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

import httpx
from google import genai
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable, TooManyRequests
from google.cloud import storage
from google.genai.errors import APIError
from groq import APIStatusError as GroqAPIStatusError
from groq import Groq

from src.audio.schemas import AudioAnalysisResult, TranscriptSegment
from src.audio.transcript_format import speaker_display
from src.config import BucketConfig
from src.cv_video_id import normalize_cv_video_id
from src.time_utils import ms_to_hms

from .exceptions import (
    ChunkAnalysisError,
    JSONParseError,
    MergeError,
    OrchestratorError,
)
from .report_guardrails import fix_metric_result_ratings
from .report_schema import (
    LessonStructureItem,
    MetricResult,
    QAReport,
    Rating,
)

def _meta_str_first(
    meta: Dict[str, Any], merged: Dict[str, Any], key: str
) -> str:
    for d in (meta, merged):
        v = d.get(key) if isinstance(d, dict) else None
        if v is not None and str(v).strip():
            return str(v).strip()
    return "-"


def _meta_int_first(
    meta: Dict[str, Any], merged: Dict[str, Any], key: str
) -> int:
    for d in (meta, merged):
        if not isinstance(d, dict):
            continue
        v = d.get(key)
        if v is None:
            continue
        try:
            return int(v)
        except (TypeError, ValueError):
            continue
    return 0


def _meta_lesson_number(meta: Dict[str, Any], merged: Dict[str, Any]) -> int:
    for k in ("lesson", "lesson_number"):
        v = meta.get(k) if isinstance(meta, dict) else None
        if v is None:
            continue
        try:
            return int(v)
        except (TypeError, ValueError):
            continue
    return _meta_int_first(meta, merged, "lesson_number")


def _meta_expected_duration_min(
    meta: Dict[str, Any], merged: Dict[str, Any], duration_min: int
) -> int:
    for d in (meta, merged):
        if not isinstance(d, dict):
            continue
        v = d.get("expected_duration_min")
        if v is None:
            continue
        try:
            n = int(v)
            if n > 0:
                return n
        except (TypeError, ValueError):
            continue
    return max(1, int(duration_min))


logger = logging.getLogger(__name__)

# Transient capacity / rate limits: initial try + up to three retries.
_GEMINI_RETRY_BACKOFF_SEC = (12.0, 30.0, 75.0)
_GROQ_RETRY_BACKOFF_SEC = (10.0, 30.0, 60.0)

# ── Prompt budget constants ───────────────────────────────────────────────
# Approximate char→token ratio: ~4 chars per token (conservative).
# Gemini 2.0 Flash: 1M token context.  Groq llama-3.3: 128k context.
# We keep budgets LOW to avoid 429 rate-limit errors on free tiers.
_MAX_CV_JSON_CHARS = 6_000        # ~1.5k tokens for CV data per chunk
_MAX_TRANSCRIPT_CHARS = 6_500     # ~1.6k tokens for transcript per chunk
_MAX_MERGE_CHUNKS_CHARS = 30_000  # ~7.5k tokens for merge payload
# One chunk at a time: parallel chunk LLMs still multiply RPM; keep this at 1
# unless you raise provider quotas. See also ``ORCHESTRATOR_LLM_SPACING_SEC``.
_CHUNK_CONCURRENCY = 1

# Audio context: structured summary + representative transcript lines (not full text).
_MAX_AUDIO_SUMMARY_JSON_CHARS = 1_800
_MAX_TRANSCRIPT_SEGMENT_LINES = 16
_MAX_DERS_YAPISI_KEYWORD_SEGMENTS = 10
_DERS_YAPISI_TRANSCRIPT_KEYWORDS = (
    "geçen",
    "ödev",
    "bugün",
    "özet",
    "görüşürüz",
    "hoşça",
    "hedef",
    "amaç",
    "hatırlıyor",
)
_MAX_SEGMENT_TEXT_CHARS = 96
_MAX_HIGHLIGHTS_IN_CHUNK = 5

# CV fields to include in chunk prompts (whitelist).
# Everything else is dropped to save tokens.
# Includes legacy motion_* keys plus ratios emitted by ``video.dynamic_visual_pipeline``.
_CV_WHITELIST_KEYS = {
    "motion_frames",
    "board_usage_ratio",
    "total_frames_analyzed",
    "teacher_visible_ratio",
    "gesture_summary",
    "slide_count",
    "movement_summary",
    "face_visible_ratio",
    "posture_summary",
    "analysis_interval_sec",
    "frames_total_sampled",
    "teacher_located_frames",
    "camera_open_frames",
    "teacher_locate_ratio",
    "camera_open_ratio_total",
    "camera_open_ratio_among_located",
    "smile_frame_ratio",
    "hand_visible_ratio",
    "movement_energy_avg",
}


def _cv_dict_is_substantive(data: Dict[str, Any]) -> bool:
    """True when CV JSON has usable metrics (not an empty stub ``{}``).

    Modal/CV writes ``results/{{video_id}}/lecture_report.json`` while older paths
    may leave a placeholder ``results/{{video_id}}.json``. If the first file exists
    but is empty, we must keep trying other candidates.
    """
    if not isinstance(data, dict) or not data:
        return False
    frames = data.get("motion_frames")
    if isinstance(frames, list) and len(frames) > 0:
        return True
    tfa = data.get("total_frames_analyzed")
    if isinstance(tfa, int) and tfa > 0:
        return True
    fts = data.get("frames_total_sampled")
    if isinstance(fts, int) and fts > 0:
        return True
    for key in (
        "board_usage_ratio",
        "teacher_visible_ratio",
        "face_visible_ratio",
        "slide_count",
        "teacher_locate_ratio",
        "camera_open_ratio_total",
        "camera_open_ratio_among_located",
        "movement_energy_avg",
        "smile_frame_ratio",
        "hand_visible_ratio",
    ):
        if key not in data:
            continue
        val = data[key]
        if isinstance(val, (int, float)):
            return True
        if isinstance(val, str) and val.strip():
            return True
        if isinstance(val, (list, dict)) and len(val) > 0:
            return True
    return False


_ENGLISH_MARKERS = {
    "good",
    "acceptable",
    "poor",
    "observation",
    "improvement",
    "teacher",
    "student",
    "classroom",
    "feedback",
    "communication",
    "organization",
}


def _is_retryable_gemini_error(exc: BaseException) -> bool:
    """True for HTTP 429 / 503 from the GenAI SDK (``APIError`` subclasses)."""
    if isinstance(exc, APIError) and exc.code in (429, 503):
        return True
    return isinstance(exc, (TooManyRequests, ResourceExhausted, ServiceUnavailable))


def _is_retryable_groq_error(exc: BaseException) -> bool:
    """True for HTTP 429 / 503 from the Groq SDK."""
    return isinstance(exc, GroqAPIStatusError) and exc.status_code in (429, 503)


def _is_retryable_openrouter_error(exc: BaseException) -> bool:
    """True for HTTP 429 / 503 from OpenRouter (httpx)."""
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (
        429,
        503,
    )


def _extract_retry_after_seconds(exc: BaseException) -> float | None:
    """Parse provider hint like 'Please try again in 18m0.864s'."""
    message = str(exc)
    match = re.search(r"try again in (\d+)m([0-9.]+)s", message, flags=re.IGNORECASE)
    if not match:
        return None
    minutes = int(match.group(1))
    seconds = float(match.group(2))
    return max(0.0, minutes * 60.0 + seconds)


def _expand_gemini_token(
    token: str,
    gemini_provider: str,
) -> list[str]:
    """Map legacy ``gemini`` token to ``vertex`` or ``aistudio``."""
    t = token.strip().lower()
    if not t:
        return []
    if t != "gemini":
        return [t]
    gp = (gemini_provider or "vertex").strip().lower()
    if gp == "vertex":
        return ["vertex"]
    if gp == "aistudio":
        return ["aistudio"]
    return []


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in items:
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def _expand_provider_order(
    provider_order: tuple[str, ...],
    gemini_provider: str,
) -> tuple[str, ...]:
    expanded: list[str] = []
    for raw in provider_order:
        expanded.extend(_expand_gemini_token(raw, gemini_provider))
    return tuple(_dedupe_preserve_order(expanded))


def _rating_severity(rating: Rating) -> int:
    return {
        Rating.na: 0,
        Rating.good: 1,
        Rating.acceptable: 2,
        Rating.poor: 3,
    }.get(rating, 0)


def _worse_rating(a: Rating, b: Rating) -> Rating:
    return a if _rating_severity(a) >= _rating_severity(b) else b


ORCHESTRATOR_SYSTEM_BASE = (
    "You are analyzing a lecture based on structured data only.\n"
    "You do NOT have access to the video. Your inputs are:\n"
    "(a) CV analysis JSON: motion tracking, board usage, slides summaries\n"
    "(b) AUDIO_SUMMARY: pace, silence, sentiment ratios, highlights, notable moments\n"
    "(c) A representative sample of timestamped transcript lines (not exhaustive)\n"
    "Use ONLY these inputs. Cite timestamps as evidence in observations.\n"
    "CRITICAL LANGUAGE RULE: Every single field in your JSON response must be in Turkish.\n"
    "This includes observation texts, improvement_tip texts, strengths, improvement_areas,\n"
    "executive_summary, feedback_metni and highlight_moments descriptions.\n"
    "Do NOT write a single word in English. If you quote from the transcript, keep the quote\n"
    "in its original language but explain it in Turkish."
)


def _truncate_one_line(text: str, max_chars: int) -> str:
    s = (text or "").replace("\n", " ").strip()
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 1] + "…"


def _build_chunk_audio_summary(
    audio_result: AudioAnalysisResult,
    start_sec: int,
    end_sec: int,
) -> Dict[str, Any]:
    """Small JSON-friendly summary for this time window (global + window-filtered)."""
    start_ms = start_sec * 1000
    end_ms = end_sec * 1000

    def in_window(ms: int) -> bool:
        return start_ms <= ms < end_ms

    ss = audio_result.sentiment_summary
    neg_out: List[Dict[str, Any]] = []
    for m in ss.most_negative_moments or []:
        sm = int(m.get("start_ms", 0))
        if not in_window(sm):
            continue
        neg_out.append(
            {
                "timestamp_hms": m.get("timestamp_hms"),
                "speaker": m.get("speaker"),
                "sentiment": m.get("sentiment"),
                "confidence": m.get("confidence"),
                "text": _truncate_one_line(str(m.get("text", "")), 110),
            }
        )
        if len(neg_out) >= 2:
            break

    pos_out: List[Dict[str, Any]] = []
    for m in ss.most_positive_moments or []:
        sm = int(m.get("start_ms", 0))
        if not in_window(sm):
            continue
        pos_out.append(
            {
                "timestamp_hms": m.get("timestamp_hms"),
                "speaker": m.get("speaker"),
                "sentiment": m.get("sentiment"),
                "confidence": m.get("confidence"),
                "text": _truncate_one_line(str(m.get("text", "")), 110),
            }
        )
        if len(pos_out) >= 2:
            break

    seg_in_window = sum(
        1
        for seg in audio_result.segments
        if not (seg.end_ms <= start_ms or seg.start_ms >= end_ms)
    )
    highlights = [
        _truncate_one_line(str(h), 140)
        for h in (audio_result.highlights or [])[:_MAX_HIGHLIGHTS_IN_CHUNK]
    ]
    return {
        "segments_in_window": seg_in_window,
        "silence_ratio": audio_result.silence_ratio,
        "speaking_pace_wpm": audio_result.speaking_pace_wpm,
        "sentiment_trend": ss.sentiment_trend,
        "positive_ratio": ss.positive_ratio,
        "neutral_ratio": ss.neutral_ratio,
        "negative_ratio": ss.negative_ratio,
        "highlights": highlights,
        "notable_negative_in_window": neg_out,
        "notable_positive_in_window": pos_out,
    }


def _fold_text_for_keyword_match(text: str) -> str:
    return unicodedata.normalize("NFC", text or "").casefold()


def _segments_matching_ders_yapisi_keywords(
    segments: List[TranscriptSegment],
    *,
    max_pick: int,
) -> List[TranscriptSegment]:
    """Pick segments whose text matches Turkish lesson-structure cues (for chunk prompts)."""
    if not segments or max_pick <= 0:
        return []
    keywords_cf = tuple(
        _fold_text_for_keyword_match(k) for k in _DERS_YAPISI_TRANSCRIPT_KEYWORDS
    )
    ordered = sorted(segments, key=lambda s: s.start_ms)
    out: List[TranscriptSegment] = []
    seen_ms: set[int] = set()
    for seg in ordered:
        if len(out) >= max_pick:
            break
        blob = _fold_text_for_keyword_match(seg.text)
        if not any(k in blob for k in keywords_cf):
            continue
        if seg.start_ms in seen_ms:
            continue
        seen_ms.add(seg.start_ms)
        out.append(seg)
    return out


def _score_segment_notability(seg: TranscriptSegment) -> float:
    lab = (seg.sentiment or "NEUTRAL").upper()
    c = float(seg.sentiment_confidence)
    if lab == "NEGATIVE":
        return 100.0 + c * 10.0
    if lab == "POSITIVE" and c >= 0.6:
        return 50.0 + c * 5.0
    tlen = len((seg.text or "").strip())
    return 10.0 + min(tlen / 80.0, 8.0)


def _select_representative_segments(
    segments: List[TranscriptSegment],
    max_lines: int,
) -> List[TranscriptSegment]:
    if not segments:
        return []
    ordered = sorted(segments, key=lambda s: s.start_ms)
    if len(ordered) <= max_lines:
        return ordered
    n = len(ordered)
    indices: set[int] = set()
    indices.add(0)
    if n > 1:
        indices.add(min(1, n - 1))
    indices.add(n - 1)
    scored = sorted(
        range(n),
        key=lambda i: _score_segment_notability(ordered[i]),
        reverse=True,
    )
    for i in scored:
        indices.add(i)
        if len(indices) >= max_lines:
            break
    if len(indices) < max_lines:
        step = max(1, n // max(1, max_lines - len(indices)))
        j = 0
        while len(indices) < max_lines and j < n:
            indices.add(j)
            j += step
    sorted_idx = sorted(indices)[:max_lines]
    return [ordered[i] for i in sorted_idx]


def _segment_compact_line(seg: TranscriptSegment) -> str:
    ts = ms_to_hms(seg.start_ms)
    sp = speaker_display(seg.speaker)
    lab = (seg.sentiment or "NEUTRAL").upper()
    conf = float(seg.sentiment_confidence)
    raw = _truncate_one_line(seg.text or "", _MAX_SEGMENT_TEXT_CHARS)
    escaped = raw.replace('"', '\\"')
    return f'[{ts}] {sp}: "{escaped}" ({lab} {conf:.2f})'


def _build_compact_transcript_sample(segments: List[TranscriptSegment]) -> str:
    if not segments:
        return ""
    kw_picked = _segments_matching_ders_yapisi_keywords(
        segments, max_pick=_MAX_DERS_YAPISI_KEYWORD_SEGMENTS
    )
    seen_ms = {s.start_ms for s in kw_picked}
    base_picked = _select_representative_segments(
        segments, _MAX_TRANSCRIPT_SEGMENT_LINES
    )
    merged: List[TranscriptSegment] = list(kw_picked)
    for s in sorted(base_picked, key=lambda x: x.start_ms):
        if s.start_ms in seen_ms:
            continue
        merged.append(s)
        seen_ms.add(s.start_ms)
    merged.sort(key=lambda s: s.start_ms)
    cap = _MAX_TRANSCRIPT_SEGMENT_LINES + _MAX_DERS_YAPISI_KEYWORD_SEGMENTS
    if len(merged) > cap:
        merged = merged[:cap]
    lines = [_segment_compact_line(s) for s in merged]
    note = (
        "Representative sample plus up to "
        f"{_MAX_DERS_YAPISI_KEYWORD_SEGMENTS} keyword-boosted lines "
        "(ders yapısı ipuçları: geçen, ödev, bugün, …). "
        "Not every utterance is shown."
    )
    return note + "\n" + "\n".join(lines)


# --------------------------------------------------------------------------- #
#  Constants
# --------------------------------------------------------------------------- #
DERS_YAPISI_ITEMS: List[Tuple[str, str]] = [
    ("isinma", "Isınma"),
    ("onceki_ders_gozden", "Önceki dersin gözden geçirilmesi"),
    ("onceki_odev", "Önceki ödevin tartışılması"),
    ("hedefler", "Hedefler ve beklenen sonuç"),
    ("ozet", "Özet"),
    ("gelecek_odev", "Gelecek ödevin tartışılması"),
    ("kapanis", "Kapanış"),
]

ILETISIM_KEYS = [
    "ders_dinamikleri",
    "mod_tutum",
    "saygi_sinirlar",
    "tesvik_motivasyon",
    "hatalar",
    "acik_uclu_sorular",
    "empati_destekleyici",
    "etik_degerler",
]
HAZIRLIK_KEYS = [
    "ders_akisi_tempo",
    "konu_bilgisi",
    "aciklama_netligi",
    "rasyonel_ipucu",
]
ORGANIZASYON_KEYS = [
    "gorsel_bilesenler",
    "konusma_ses_tonu",
    "teknik_bilesen",
    "zamanlama",
]


# --------------------------------------------------------------------------- #
#  Orchestrator
# --------------------------------------------------------------------------- #
class ReportOrchestrator:
    """Generate a ``QAReport`` from CV + audio data using LLM providers + fallbacks."""

    def __init__(
        self,
        gemini_api_key: str | None,
        groq_api_key: str | None,
        groq_extra_api_key: str | None,
        buckets: BucketConfig,
        openrouter_api_key: str | None = None,
        openrouter_model: str | None = None,
        google_cloud_project: str | None = None,
        gemini_provider: str = "vertex",
        vertex_location: str = "us-central1",
        gemini_model: str = "gemini-2.0-flash",
        groq_model: str = "llama-3.3-70b-versatile",
        provider_order: tuple[str, ...] = ("gemini", "groq"),
        chunk_minutes: int = 60,
        degraded_fallback: bool = False,
        llm_spacing_sec: float = 0.0,
        status_callback: Optional[Callable[[str, str], None]] = None,
    ) -> None:
        gemini_provider = (gemini_provider or "vertex").strip().lower()
        if gemini_provider not in {"vertex", "aistudio"}:
            raise ValueError("gemini_provider must be 'vertex' or 'aistudio'")
        if buckets is None:
            raise ValueError("buckets (BucketConfig) is required")
        if chunk_minutes <= 0:
            raise ValueError("chunk_minutes must be positive")
        if llm_spacing_sec < 0:
            raise ValueError("llm_spacing_sec must be non-negative")

        self.buckets = buckets
        self.chunk_minutes = chunk_minutes
        self.gemini_provider = gemini_provider
        self.gemini_model_name = gemini_model
        self.groq_model_name = groq_model
        key = (openrouter_api_key or "").strip()
        self._openrouter_api_key: str | None = key if key else None
        self._openrouter_model_name = (
            (openrouter_model or "").strip() or "google/gemini-2.0-flash-001"
        )
        self._degraded_fallback = degraded_fallback
        self._llm_spacing_sec = float(llm_spacing_sec)
        self._status_callback = status_callback

        expanded = _expand_provider_order(provider_order, gemini_provider)
        want_vertex = "vertex" in expanded
        want_aistudio = "aistudio" in expanded

        self._aistudio_client = (
            genai.Client(api_key=gemini_api_key)
            if (gemini_api_key and want_aistudio)
            else None
        )
        self._vertex_model: Any = None
        self._vertex_fallback_models: list[str] = [
            "gemini-1.5-flash",
            "gemini-flash-latest",
        ]
        if want_vertex:
            if not google_cloud_project:
                logger.warning(
                    "vertex appears in ORCHESTRATOR_PROVIDER_ORDER but "
                    "google_cloud_project is missing; Vertex will be skipped"
                )
            else:
                import vertexai
                from vertexai.generative_models import GenerativeModel

                vertexai.init(
                    project=google_cloud_project, location=vertex_location
                )
                self._vertex_model = GenerativeModel(gemini_model)

        self._groq_client = Groq(api_key=groq_api_key) if groq_api_key else None
        self._groq_extra_client = (
            Groq(api_key=groq_extra_api_key) if groq_extra_api_key else None
        )

        available: Dict[str, bool] = {
            "openrouter": self._openrouter_api_key is not None,
            "aistudio": self._aistudio_client is not None,
            "vertex": self._vertex_model is not None,
            "groq": self._groq_client is not None,
        }
        self._provider_order = [p for p in expanded if available.get(p, False)]
        if not self._provider_order:
            raise ValueError("provider_order has no enabled providers")

        self._storage_client: storage.Client = storage.Client()

    def _emit_status(self, event: str, detail: str = "") -> None:
        callback = self._status_callback
        if callback is None:
            return
        try:
            callback(event, detail)
        except Exception:
            logger.debug("status callback failed event=%s", event, exc_info=True)

    async def _generate_aistudio_with_retry(
        self,
        *,
        video_id: str,
        purpose: str,
        contents: str,
    ) -> Any:
        """Google AI Studio (API key) via ``google.genai``."""
        if self._aistudio_client is None:
            raise RuntimeError("AI Studio client is not configured")

        def _call() -> Any:
            return self._aistudio_client.models.generate_content(
                model=self.gemini_model_name,
                contents=contents,
            )

        max_attempts = len(_GEMINI_RETRY_BACKOFF_SEC) + 1
        last_exc: Optional[BaseException] = None
        for attempt in range(max_attempts):
            try:
                return await asyncio.to_thread(_call)
            except Exception as exc:
                last_exc = exc
                if (
                    not _is_retryable_gemini_error(exc)
                    or attempt >= max_attempts - 1
                ):
                    raise
                delay = _GEMINI_RETRY_BACKOFF_SEC[attempt]
                hinted_delay = _extract_retry_after_seconds(exc)
                if hinted_delay is not None:
                    # Respect provider hint but avoid unbounded worker stalls.
                    delay = min(300.0, max(delay, hinted_delay))
                logger.warning(
                    "[%s] AI Studio %s failed (attempt %d/%d): %s; "
                    "sleeping %.0fs before retry",
                    video_id,
                    purpose,
                    attempt + 1,
                    max_attempts,
                    exc,
                    delay,
                )
                self._emit_status(
                    "llm_retry_wait",
                    f"provider=aistudio purpose={purpose} attempt={attempt + 1}/{max_attempts} delay_sec={delay:.0f} err={exc}",
                )
                await asyncio.sleep(delay)
        assert last_exc is not None
        raise last_exc

    async def _generate_vertex_with_retry(
        self,
        *,
        video_id: str,
        purpose: str,
        contents: str,
    ) -> Any:
        """Vertex AI ``GenerativeModel`` with publisher-model fallbacks."""
        if self._vertex_model is None:
            raise RuntimeError("Vertex model is not configured")

        def _call_vertex() -> Any:
            from vertexai.generative_models import GenerativeModel as VertexModel

            try:
                return self._vertex_model.generate_content(contents)
            except Exception as exc:
                if "Publisher Model" not in str(exc):
                    raise
                for fallback_model in self._vertex_fallback_models:
                    if fallback_model == self.gemini_model_name:
                        continue
                    try:
                        logger.warning(
                            "[%s] Vertex model unavailable (%s); trying %s",
                            video_id,
                            self.gemini_model_name,
                            fallback_model,
                        )
                        return VertexModel(fallback_model).generate_content(
                            contents
                        )
                    except Exception:
                        continue
                raise

        max_attempts = len(_GEMINI_RETRY_BACKOFF_SEC) + 1
        last_exc: Optional[BaseException] = None
        for attempt in range(max_attempts):
            try:
                return await asyncio.to_thread(_call_vertex)
            except Exception as exc:
                last_exc = exc
                if (
                    not _is_retryable_gemini_error(exc)
                    or attempt >= max_attempts - 1
                ):
                    raise
                delay = _GEMINI_RETRY_BACKOFF_SEC[attempt]
                hinted_delay = _extract_retry_after_seconds(exc)
                if hinted_delay is not None:
                    # Respect provider hint but avoid unbounded worker stalls.
                    delay = min(300.0, max(delay, hinted_delay))
                logger.warning(
                    "[%s] Vertex %s failed (attempt %d/%d): %s; "
                    "sleeping %.0fs before retry",
                    video_id,
                    purpose,
                    attempt + 1,
                    max_attempts,
                    exc,
                    delay,
                )
                self._emit_status(
                    "llm_retry_wait",
                    f"provider=vertex purpose={purpose} attempt={attempt + 1}/{max_attempts} delay_sec={delay:.0f} err={exc}",
                )
                await asyncio.sleep(delay)
        assert last_exc is not None
        raise last_exc

    async def _generate_groq_with_retry(
        self,
        *,
        video_id: str,
        purpose: str,
        contents: str,
    ) -> str:
        """Call Groq chat completion with backoff on 429/503 only."""
        if self._groq_client is None:
            raise RuntimeError("groq client is not configured")

        async def _call(client: Groq) -> str:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=self.groq_model_name,
                messages=[{"role": "user", "content": contents}],
                temperature=0.0,
            )
            return _extract_groq_response_text(response)

        max_attempts = len(_GROQ_RETRY_BACKOFF_SEC) + 1
        last_exc: Optional[BaseException] = None
        for attempt in range(max_attempts):
            try:
                return await _call(self._groq_client)
            except Exception as exc:
                last_exc = exc
                if (
                    self._groq_extra_client is not None
                    and _is_retryable_groq_error(exc)
                ):
                    try:
                        logger.warning(
                            "[%s] Groq primary key rate-limited for %s; trying GROQ_EKSTRA",
                            video_id,
                            purpose,
                        )
                        return await _call(self._groq_extra_client)
                    except Exception as extra_exc:
                        last_exc = extra_exc
                if (
                    not _is_retryable_groq_error(last_exc)
                    or attempt >= max_attempts - 1
                ):
                    raise last_exc
                delay = _GROQ_RETRY_BACKOFF_SEC[attempt]
                hinted_delay = _extract_retry_after_seconds(last_exc)
                if hinted_delay is not None:
                    # Respect provider hint but cap waiting to keep worker responsive.
                    delay = min(300.0, max(delay, hinted_delay))
                logger.warning(
                    "[%s] Groq %s failed (attempt %d/%d): %s; "
                    "sleeping %.0fs before retry",
                    video_id,
                    purpose,
                    attempt + 1,
                    max_attempts,
                    last_exc,
                    delay,
                )
                self._emit_status(
                    "llm_retry_wait",
                    f"provider=groq purpose={purpose} attempt={attempt + 1}/{max_attempts} delay_sec={delay:.0f} err={last_exc}",
                )
                await asyncio.sleep(delay)
        assert last_exc is not None
        raise last_exc

    async def _generate_openrouter_with_retry(
        self,
        *,
        video_id: str,
        purpose: str,
        contents: str,
    ) -> str:
        """OpenRouter Chat Completions (OpenAI-compatible)."""
        if not self._openrouter_api_key:
            raise RuntimeError("OpenRouter is not configured")

        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._openrouter_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._openrouter_model_name,
            "messages": [{"role": "user", "content": contents}],
            "temperature": 0.0,
        }
        timeout = httpx.Timeout(300.0)
        max_attempts = len(_GROQ_RETRY_BACKOFF_SEC) + 1
        last_exc: Optional[BaseException] = None
        for attempt in range(max_attempts):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(url, headers=headers, json=payload)
                    response.raise_for_status()
                    data = response.json()
                choices = data.get("choices")
                if not isinstance(choices, list) or not choices:
                    raise ValueError(
                        f"OpenRouter missing choices in response keys={list(data.keys())}"
                    )
                msg = choices[0].get("message") if isinstance(choices[0], dict) else {}
                text = str((msg or {}).get("content") or "")
                if not text.strip():
                    raise ValueError("OpenRouter returned empty content")
                return text
            except (ValueError, json.JSONDecodeError):
                raise
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if (
                    not _is_retryable_openrouter_error(exc)
                    or attempt >= max_attempts - 1
                ):
                    raise
                delay = _GROQ_RETRY_BACKOFF_SEC[attempt]
                ra = exc.response.headers.get("retry-after")
                if ra:
                    try:
                        delay = min(300.0, max(delay, float(ra)))
                    except ValueError:
                        pass
                hinted = _extract_retry_after_seconds(exc)
                if hinted is not None:
                    delay = min(300.0, max(delay, hinted))
                logger.warning(
                    "[%s] OpenRouter %s failed (attempt %d/%d): %s; "
                    "sleeping %.0fs before retry",
                    video_id,
                    purpose,
                    attempt + 1,
                    max_attempts,
                    exc,
                    delay,
                )
                self._emit_status(
                    "llm_retry_wait",
                    f"provider=openrouter purpose={purpose} "
                    f"attempt={attempt + 1}/{max_attempts} delay_sec={delay:.0f} err={exc}",
                )
                await asyncio.sleep(delay)
        assert last_exc is not None
        raise last_exc

    async def _spacing_after_successful_llm(self) -> None:
        """Optional pause between successful LLM calls to stay under RPM limits."""
        spacing = self._llm_spacing_sec
        # Gemini free / low tiers can return 429 on bursty sequential calls.
        if spacing <= 0 and any(
            p in {"aistudio", "vertex", "openrouter"}
            for p in self._provider_order
        ):
            spacing = 1.0
        if spacing <= 0:
            return
        await asyncio.sleep(spacing)

    async def _generate_text_with_fallback(
        self,
        *,
        video_id: str,
        purpose: str,
        contents: str,
    ) -> str:
        errors: list[str] = []
        for provider in self._provider_order:
            try:
                if provider == "aistudio":
                    self._emit_status("llm_provider_try", f"provider=aistudio purpose={purpose}")
                    logger.info(
                        "[%s] LLM_PROVIDER_TRY provider=aistudio model=%s purpose=%s",
                        video_id,
                        self.gemini_model_name,
                        purpose,
                    )
                    response = await self._generate_aistudio_with_retry(
                        video_id=video_id,
                        purpose=purpose,
                        contents=contents,
                    )
                    logger.info(
                        "[%s] LLM_PROVIDER_OK provider=aistudio model=%s purpose=%s",
                        video_id,
                        self.gemini_model_name,
                        purpose,
                    )
                    out = _extract_response_text(response)
                    self._emit_status("llm_provider_ok", f"provider=aistudio purpose={purpose}")
                    await self._spacing_after_successful_llm()
                    return out
                if provider == "vertex":
                    self._emit_status("llm_provider_try", f"provider=vertex purpose={purpose}")
                    logger.info(
                        "[%s] LLM_PROVIDER_TRY provider=vertex model=%s purpose=%s",
                        video_id,
                        self.gemini_model_name,
                        purpose,
                    )
                    response = await self._generate_vertex_with_retry(
                        video_id=video_id,
                        purpose=purpose,
                        contents=contents,
                    )
                    logger.info(
                        "[%s] LLM_PROVIDER_OK provider=vertex model=%s purpose=%s",
                        video_id,
                        self.gemini_model_name,
                        purpose,
                    )
                    out = _extract_response_text(response)
                    self._emit_status("llm_provider_ok", f"provider=vertex purpose={purpose}")
                    await self._spacing_after_successful_llm()
                    return out
                if provider == "openrouter":
                    self._emit_status(
                        "llm_provider_try", f"provider=openrouter purpose={purpose}"
                    )
                    logger.info(
                        "[%s] LLM_PROVIDER_TRY provider=openrouter model=%s purpose=%s",
                        video_id,
                        self._openrouter_model_name,
                        purpose,
                    )
                    text = await self._generate_openrouter_with_retry(
                        video_id=video_id,
                        purpose=purpose,
                        contents=contents,
                    )
                    logger.info(
                        "[%s] LLM_PROVIDER_OK provider=openrouter model=%s purpose=%s",
                        video_id,
                        self._openrouter_model_name,
                        purpose,
                    )
                    self._emit_status(
                        "llm_provider_ok", f"provider=openrouter purpose={purpose}"
                    )
                    await self._spacing_after_successful_llm()
                    return text
                if provider == "groq":
                    self._emit_status("llm_provider_try", f"provider=groq purpose={purpose}")
                    logger.info(
                        "[%s] LLM_PROVIDER_TRY provider=groq model=%s purpose=%s",
                        video_id,
                        self.groq_model_name,
                        purpose,
                    )
                    text = await self._generate_groq_with_retry(
                        video_id=video_id,
                        purpose=purpose,
                        contents=contents,
                    )
                    logger.info(
                        "[%s] LLM_PROVIDER_OK provider=groq model=%s purpose=%s",
                        video_id,
                        self.groq_model_name,
                        purpose,
                    )
                    await self._spacing_after_successful_llm()
                    self._emit_status("llm_provider_ok", f"provider=groq purpose={purpose}")
                    return text
            except Exception as exc:
                self._emit_status(
                    "llm_provider_failed",
                    f"provider={provider} purpose={purpose} err={exc}",
                )
                logger.warning(
                    "[%s] provider=%s purpose=%s failed, trying next provider: %s",
                    video_id,
                    provider,
                    purpose,
                    exc,
                )
                errors.append(f"{provider}: {exc}")
        raise OrchestratorError(
            f"all LLM providers failed for {purpose}: {' | '.join(errors)}",
            video_id=video_id,
        )

    def _build_quota_depleted_feedback(
        self,
        video_id: str,
        cv_data: Dict[str, Any],
        audio_result: AudioAnalysisResult,
        duration_min: int,
        *,
        merge_note: str = "",
    ) -> str:
        total_sec = max(
            1,
            self._infer_total_seconds(audio_result, cv_data),
        )
        summary = _build_chunk_audio_summary(audio_result, 0, total_sec)
        cv_subset = {
            k: cv_data.get(k) for k in sorted(_CV_WHITELIST_KEYS) if k in cv_data
        }
        cv_digest = _truncate_text(
            json.dumps(cv_subset, ensure_ascii=False, default=str),
            3500,
            "cv_digest",
        )
        lines = [
            "AI Analizi Bekleniyor (Kota Dolu)",
            "",
            "Bu rapor, tüm LLM sağlayıcıları başarısız olduğunda veya birleştirme "
            "adımı tamamlanamadığında üretilen yedek teknik özet olarak hazırlanmıştır. "
            "Pipeline çıktıları (CV + ses) aşağıda ham biçimde özetlenmiştir.",
        ]
        if merge_note:
            lines.extend(["", merge_note])
        lines.extend(
            [
                "",
                f"video_id: {video_id}",
                f"Yaklaşık süre: {duration_min} dk",
                f"Konuşma hızı: {audio_result.speaking_pace_wpm:.0f} wpm, "
                f"sessizlik oranı: {audio_result.silence_ratio:.1%}",
                "",
                "=== AUDIO_SUMMARY (JSON) ===",
                json.dumps(summary, ensure_ascii=False, default=str),
                "",
                "=== CV (whitelist alanları) ===",
                cv_digest,
            ]
        )
        return "\n".join(lines)

    def _merged_dict_from_cv_audio_only(
        self,
        video_id: str,
        cv_data: Dict[str, Any],
        audio_result: AudioAnalysisResult,
        duration_min: int,
    ) -> Dict[str, Any]:
        na_obs = (
            "LLM katmanı kota aşımı, geçici kapasite veya yapılandırma hatası "
            "nedeniyle bu metrik için otomatik pedagogik puan üretilemedi. Ham veri "
            "geri bildirim metninde özetlenmiştir."
        )
        na_tip = (
            "Kota veya erişim düzeldiğinde raporu yeniden çalıştırın; "
            "GEMINI_API_KEY ve ORCHESTRATOR_PROVIDER_ORDER ile alternatif "
            "sağlayıcıları deneyebilirsiniz."
        )

        def na_metric() -> Dict[str, str]:
            return {
                "rating": Rating.na.value,
                "observation": na_obs,
                "improvement_tip": na_tip,
            }

        ders_yapisi_dict = {key: False for key, _ in DERS_YAPISI_ITEMS}
        return {
            "instructor_name": "",
            "lesson_date": "",
            "module": 0,
            "lesson_number": 0,
            "expected_duration_min": duration_min,
            "actual_duration_min": duration_min,
            "speaking_time_rating": self._speaking_time_rating_from_audio(
                audio_result
            ),
            "iletisim": {k: na_metric() for k in ILETISIM_KEYS},
            "hazirlik": {k: na_metric() for k in HAZIRLIK_KEYS},
            "organizasyon": {k: na_metric() for k in ORGANIZASYON_KEYS},
            "ders_yapisi": ders_yapisi_dict,
            "genel_sonuc": "Beklentilere uygundu.",
            "yeterlilikler": Rating.na.value,
            "stop_faktor": 0,
            "feedback_metni": self._build_quota_depleted_feedback(
                video_id, cv_data, audio_result, duration_min
            ),
        }

    def _rollup_chunk_analyses_to_merged(
        self,
        video_id: str,
        chunk_analyses: List[Dict[str, Any]],
        audio_result: AudioAnalysisResult,
        duration_min: int,
        cv_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        def rollup_section(keys: List[str], section: str) -> Dict[str, Any]:
            out: Dict[str, Any] = {}
            for key in keys:
                winner: Optional[Dict[str, Any]] = None
                winner_rating: Optional[Rating] = None
                for ch in chunk_analyses:
                    sec = ch.get(section) or {}
                    if not isinstance(sec, dict):
                        continue
                    cell = sec.get(key)
                    if not isinstance(cell, dict):
                        continue
                    r = _coerce_rating(cell.get("rating"), Rating.na)
                    if winner is None:
                        winner = dict(cell)
                        winner_rating = r
                        continue
                    assert winner_rating is not None
                    if _rating_severity(r) > _rating_severity(winner_rating):
                        winner = dict(cell)
                        winner_rating = r
                    elif (
                        _rating_severity(r) == _rating_severity(winner_rating)
                        and winner is not None
                    ):
                        o1 = str(winner.get("observation") or "")
                        o2 = str(cell.get("observation") or "")
                        if o2 and o2 not in o1:
                            merged_obs = (o1 + " " + o2).strip()
                            winner["observation"] = merged_obs[:1200]
                if winner is None:
                    out[key] = {
                        "rating": Rating.na.value,
                        "observation": (
                            f"{section}/{key} için geçerli parça analizi bulunamadı."
                        ),
                        "improvement_tip": "",
                    }
                else:
                    prefix = (
                        "[Parça analizlerinden türetildi; nihai LLM birleştirmesi "
                        "kota veya hata nedeniyle atlandı.] "
                    )
                    winner["observation"] = prefix + str(
                        winner.get("observation") or ""
                    )
                    out[key] = winner
            return out

        iletisim = rollup_section(ILETISIM_KEYS, "iletisim")
        hazirlik = rollup_section(HAZIRLIK_KEYS, "hazirlik")
        organizasyon = rollup_section(ORGANIZASYON_KEYS, "organizasyon")

        dy_merged: Dict[str, bool] = {
            key: False for key, _ in DERS_YAPISI_ITEMS
        }
        for ch in chunk_analyses:
            raw_dy = ch.get("ders_yapisi")
            if not isinstance(raw_dy, dict):
                continue
            for key, _ in DERS_YAPISI_ITEMS:
                dy_merged[key] = dy_merged[key] or bool(raw_dy.get(key))

        overall: Optional[Rating] = None
        stop_faktor = 0
        for section in (iletisim, hazirlik, organizasyon):
            for cell in section.values():
                rr = _coerce_rating(cell.get("rating"), Rating.na)
                overall = rr if overall is None else _worse_rating(overall, rr)
                if rr == Rating.poor:
                    stop_faktor += 1
        if overall is None:
            overall = Rating.na

        genel_sonuc = "Beklentilere uygundu."
        if overall == Rating.poor:
            genel_sonuc = "Beklentilerin altında."
        elif overall == Rating.good:
            genel_sonuc = "Beklentilerin üzerinde."

        merge_note = (
            "Birden fazla zaman penceresi için LLM çıktısı mevcut; nihai birleştirme "
            "çağrısı kota veya hata nedeniyle yapılamadı. Metrikler parçalar arasında "
            "en sıkı (en düşük) skora göre seçildi."
        )
        feedback_metni = self._build_quota_depleted_feedback(
            video_id,
            cv_data,
            audio_result,
            duration_min,
            merge_note=merge_note,
        )

        return {
            "instructor_name": "",
            "lesson_date": "",
            "module": 0,
            "lesson_number": 0,
            "expected_duration_min": duration_min,
            "actual_duration_min": duration_min,
            "speaking_time_rating": self._speaking_time_rating_from_audio(
                audio_result
            ),
            "iletisim": iletisim,
            "hazirlik": hazirlik,
            "organizasyon": organizasyon,
            "ders_yapisi": dy_merged,
            "genel_sonuc": genel_sonuc,
            "yeterlilikler": overall.value,
            "stop_faktor": stop_faktor,
            "feedback_metni": feedback_metni,
        }

    @staticmethod
    def _speaking_time_rating_from_audio(
        audio_result: AudioAnalysisResult,
    ) -> str:
        pace = float(audio_result.speaking_pace_wpm or 0.0)
        sil = float(audio_result.silence_ratio or 0.0)
        if sil > 0.35:
            return "too_much"
        if pace > 180:
            return "too_little"
        if 120 <= pace <= 160 and sil < 0.2:
            return "satisfactory"
        return "satisfactory"

    # ------------------------------------------------------------------ #
    #  Public API
    # ------------------------------------------------------------------ #
    async def generate_report(
        self,
        video_id: str,
        audio_result: AudioAnalysisResult,
    ) -> QAReport:
        logger.info("[%s] ReportOrchestrator.generate_report start", video_id)
        overall_start = time.time()

        # STEP 1 - load CV ------------------------------------------------
        cv_data = await self._load_cv_data(video_id)
        metadata = await self._load_metadata(video_id)

        # STEP 2 - chunk --------------------------------------------------
        chunks = self._build_chunks(audio_result, cv_data)
        if not chunks:
            raise OrchestratorError(
                "no chunks produced from audio/CV data", video_id=video_id
            )
        logger.info(
            "[%s] produced %d chunk(s) of %d minute(s) each",
            video_id,
            len(chunks),
            self.chunk_minutes,
        )
        duration_min = self._derive_duration_min(audio_result)

        # STEP 3 - analyse each chunk in parallel -------------------------
        chunk_analyses = await self._analyze_all_chunks(video_id, chunks)
        if not chunk_analyses:
            if self._degraded_fallback:
                logger.warning(
                    "[%s] all chunk LLM calls failed; emitting degraded QAReport",
                    video_id,
                )
                merged = self._merged_dict_from_cv_audio_only(
                    video_id, cv_data, audio_result, duration_min
                )
                report = self._build_final_report(
                    video_id, merged, duration_min, metadata=metadata
                )
                await self._save_report(video_id, report)
                logger.info(
                    "[%s] ReportOrchestrator.generate_report done in %.2fs "
                    "(degraded / no chunk LLM)",
                    video_id,
                    time.time() - overall_start,
                )
                return report
            raise OrchestratorError(
                "every chunk analysis failed", video_id=video_id
            )

        # STEP 4 - merge --------------------------------------------------
        # If there's only one chunk, use its analysis directly as the merged
        # result to save an entire LLM call (huge token savings).
        if len(chunk_analyses) == 1:
            logger.info(
                "[%s] single chunk — skipping merge LLM call", video_id
            )
            merged = chunk_analyses[0]
        else:
            try:
                merged = await self._merge_chunks(
                    video_id, chunk_analyses, audio_result, duration_min
                )
            except MergeError as merge_exc:
                if self._degraded_fallback:
                    logger.warning(
                        "[%s] merge LLM failed (%s); rollup from chunk JSON",
                        video_id,
                        merge_exc,
                    )
                    merged = self._rollup_chunk_analyses_to_merged(
                        video_id,
                        chunk_analyses,
                        audio_result,
                        duration_min,
                        cv_data,
                    )
                else:
                    raise

        # STEP 5 - build final model + save -------------------------------
        report = self._build_final_report(
            video_id, merged, duration_min, metadata=metadata
        )
        await self._save_report(video_id, report)

        logger.info(
            "[%s] ReportOrchestrator.generate_report done in %.2fs",
            video_id,
            time.time() - overall_start,
        )
        return report

    # ------------------------------------------------------------------ #
    #  Step 1 - CV loading
    # ------------------------------------------------------------------ #
    async def _load_cv_data(self, video_id: str) -> Dict[str, Any]:
        with self._stage(video_id, "load_cv"):
            bucket = self._storage_client.bucket(self.buckets.processed)
            attempted_paths: List[str] = []
            saw_any_blob = False
            for cv_path in self._candidate_cv_paths(video_id):
                attempted_paths.append(cv_path)
                try:
                    blob = bucket.blob(cv_path)
                    exists = await asyncio.to_thread(blob.exists)
                    if not exists:
                        continue
                    saw_any_blob = True
                    payload = await asyncio.to_thread(blob.download_as_text)
                    data = json.loads(payload)
                    if not isinstance(data, dict):
                        raise ValueError("CV JSON top-level must be an object")
                    if _cv_dict_is_substantive(data):
                        logger.info(
                            "[%s] loaded substantive CV JSON from gs://%s/%s keys=%s",
                            video_id,
                            self.buckets.processed,
                            cv_path,
                            sorted(data.keys())[:24],
                        )
                        return data
                    logger.warning(
                        "[%s] CV JSON at gs://%s/%s is empty or stub; "
                        "trying next candidate path",
                        video_id,
                        self.buckets.processed,
                        cv_path,
                    )
                except OrchestratorError:
                    raise
                except Exception as exc:
                    raise OrchestratorError(
                        f"failed to load CV JSON from gs://"
                        f"{self.buckets.processed}/{cv_path}: {exc}",
                        video_id=video_id,
                    ) from exc

            if saw_any_blob:
                logger.warning(
                    "[%s] all CV JSON objects were missing metrics (stub/empty); "
                    "continuing with empty CV",
                    video_id,
                )
                return {}

            tried = ", ".join(
                f"gs://{self.buckets.processed}/{path}" for path in attempted_paths
            )
            raise OrchestratorError(
                f"failed to load CV JSON; no object found at any known path: {tried}",
                video_id=video_id,
            )

    async def _load_metadata(self, video_id: str) -> Dict[str, Any]:
        """Load lesson metadata written by FastAPI at trigger time."""
        with self._stage(video_id, "load_metadata"):
            bucket = self._storage_client.bucket(self.buckets.processed)
            raw = (video_id or "").strip()
            variants = _dedupe_preserve_order(
                [normalize_cv_video_id(raw), raw]
            )
            for vid in variants:
                if not vid:
                    continue
                blob_path = f"metadata/{vid}.json"
                try:
                    blob = bucket.blob(blob_path)
                    exists = await asyncio.to_thread(blob.exists)
                    if not exists:
                        continue
                    payload = await asyncio.to_thread(blob.download_as_text)
                    data = json.loads(payload)
                    if isinstance(data, dict):
                        logger.info(
                            "[%s] loaded metadata from gs://%s/%s",
                            video_id,
                            self.buckets.processed,
                            blob_path,
                        )
                        return data
                except Exception as e:
                    logger.warning(
                        "[%s] metadata load failed for gs://%s/%s: %s",
                        video_id,
                        self.buckets.processed,
                        blob_path,
                        e,
                    )
            return {}

    def _candidate_cv_paths(self, video_id: str) -> List[str]:
        """Ordered CV JSON lookup paths for backward compatibility.

        Prefer ``results/{{id}}/lecture_report.json`` (Modal/cv_engine) over the
        legacy flat ``results/{{id}}.json``. Try ``normalize_cv_video_id`` first
        so GCS keys match the CV worker, then the raw id.
        """
        raw = (video_id or "").strip()
        variants = _dedupe_preserve_order(
            [normalize_cv_video_id(raw), raw]
        )
        candidates: List[str] = []
        for vid in variants:
            if not vid:
                continue
            nested_report = f"results/{vid}/lecture_report.json"
            if nested_report not in candidates:
                candidates.append(nested_report)
            configured = self.buckets.cv_path(vid)
            if configured not in candidates:
                candidates.append(configured)
        return candidates

    # ------------------------------------------------------------------ #
    #  Step 2 - chunking
    # ------------------------------------------------------------------ #
    def _build_chunks(
        self,
        audio_result: AudioAnalysisResult,
        cv_data: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Split audio segments and CV motion frames into time windows."""
        chunk_sec = self.chunk_minutes * 60

        total_sec = self._infer_total_seconds(audio_result, cv_data)
        if total_sec <= 0:
            total_sec = chunk_sec  # single fallback chunk

        chunks: List[Dict[str, Any]] = []
        chunk_index = 0
        start_sec = 0
        while start_sec < total_sec:
            end_sec = min(start_sec + chunk_sec, total_sec)

            audio_segments = self._segments_in_range(
                audio_result.segments, start_sec, end_sec
            )
            cv_slice = self._cv_slice_for_range(cv_data, start_sec, end_sec)

            chunks.append(
                {
                    "chunk_index": chunk_index,
                    "start_sec": start_sec,
                    "end_sec": end_sec,
                    "audio_segments": audio_segments,
                    "audio_summary": _build_chunk_audio_summary(
                        audio_result, start_sec, end_sec
                    ),
                    "cv_data": cv_slice,
                }
            )
            chunk_index += 1
            start_sec = end_sec

        return chunks

    @staticmethod
    def _infer_total_seconds(
        audio_result: AudioAnalysisResult,
        cv_data: Dict[str, Any],
    ) -> int:
        end_ms = 0
        for seg in audio_result.segments:
            if seg.end_ms > end_ms:
                end_ms = seg.end_ms
        dur_ms = getattr(audio_result, "duration_ms", None)
        if isinstance(dur_ms, (int, float)) and dur_ms > 0:
            end_ms = max(end_ms, int(dur_ms))

        cv_end_sec = 0
        frames = cv_data.get("motion_frames") or []
        for frame in frames if isinstance(frames, list) else []:
            ts = _extract_frame_ts_sec(frame)
            if ts is not None and ts > cv_end_sec:
                cv_end_sec = int(ts)

        return max(end_ms // 1000, cv_end_sec)

    @staticmethod
    def _segments_in_range(
        segments: List[TranscriptSegment],
        start_sec: int,
        end_sec: int,
    ) -> List[TranscriptSegment]:
        start_ms = start_sec * 1000
        end_ms = end_sec * 1000
        out: List[TranscriptSegment] = []
        for seg in segments:
            # Include any segment that overlaps the window
            if seg.end_ms <= start_ms or seg.start_ms >= end_ms:
                continue
            out.append(seg)
        return out

    @staticmethod
    def _cv_slice_for_range(
        cv_data: Dict[str, Any], start_sec: int, end_sec: int
    ) -> Dict[str, Any]:
        """Best-effort slice of CV data that overlaps [start_sec, end_sec).

        Only whitelisted keys are kept to control prompt size.
        motion_frames are time-filtered; scalar summaries are passed through.
        """
        sliced: Dict[str, Any] = {}

        for key, value in cv_data.items():
            if key not in _CV_WHITELIST_KEYS:
                continue
            if key == "motion_frames" and isinstance(value, list):
                sliced[key] = [
                    _compact_frame(frame)
                    for frame in value
                    if _frame_in_range(frame, start_sec, end_sec)
                ]
            else:
                sliced[key] = value
        return sliced

    # ------------------------------------------------------------------ #
    #  Step 3 - chunk analysis
    # ------------------------------------------------------------------ #
    async def _analyze_all_chunks(
        self, video_id: str, chunks: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        total = len(chunks)
        semaphore = asyncio.Semaphore(_CHUNK_CONCURRENCY)

        async def _guarded(chunk: Dict[str, Any]) -> Dict[str, Any]:
            async with semaphore:
                return await self._analyze_single_chunk(video_id, chunk, total)

        tasks = [_guarded(c) for c in chunks]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        analyses: List[Dict[str, Any]] = []
        for chunk, result in zip(chunks, results):
            if isinstance(result, Exception):
                logger.warning(
                    "[%s] chunk %d analysis failed: %s",
                    video_id,
                    chunk["chunk_index"],
                    result,
                )
                continue
            analyses.append(result)
        return analyses

    async def _analyze_single_chunk(
        self,
        video_id: str,
        chunk: Dict[str, Any],
        total_chunks: int,
    ) -> Dict[str, Any]:
        idx = chunk["chunk_index"]
        with self._stage(video_id, f"chunk_{idx}"):
            try:
                prompt = self._build_chunk_prompt(chunk, total_chunks)
                text = await self._generate_text_with_fallback(
                    video_id=video_id,
                    purpose=f"chunk_{idx}",
                    contents=prompt,
                )
                data = _parse_gemini_json(text, video_id=video_id)
                data["chunk_index"] = idx
                data["start_sec"] = chunk["start_sec"]
                data["end_sec"] = chunk["end_sec"]
                return data
            except JSONParseError:
                raise
            except Exception as exc:
                raise ChunkAnalysisError(
                    f"Gemini analysis failed: {exc}",
                    video_id=video_id,
                    chunk_index=idx,
                ) from exc

    def _build_chunk_prompt(
        self, chunk: Dict[str, Any], total_chunks: int
    ) -> str:
        idx = chunk["chunk_index"]
        start_min = chunk["start_sec"] // 60
        end_min = chunk["end_sec"] // 60

        audio_segments: List[TranscriptSegment] = chunk["audio_segments"]
        speaker_stats = dict(
            Counter(s.speaker for s in audio_segments if s.speaker)
        )
        sentiment_counts = dict(
            Counter(
                (s.sentiment or "NEUTRAL").upper() for s in audio_segments
            )
        )

        cv_json = _truncate_text(
            json.dumps(chunk["cv_data"], ensure_ascii=False, default=str),
            _MAX_CV_JSON_CHARS,
            "cv_data",
        )
        audio_summary = chunk.get("audio_summary") or {}
        summary_json = _truncate_text(
            json.dumps(audio_summary, ensure_ascii=False, default=str),
            _MAX_AUDIO_SUMMARY_JSON_CHARS,
            "audio_summary",
        )
        transcript_sample = _truncate_text(
            _build_compact_transcript_sample(audio_segments),
            _MAX_TRANSCRIPT_CHARS,
            "transcript_sample",
        )
        cv_data = (
            chunk.get("cv_data") if isinstance(chunk.get("cv_data"), dict) else {}
        )
        board_usage_ratio = cv_data.get("board_usage_ratio")
        if board_usage_ratio is None:
            board_usage_ratio = (cv_data.get("engagement") or {}).get(
                "board_usage_ratio"
            )
        slide_segments = cv_data.get("slide_segments")
        if not isinstance(slide_segments, list):
            slide_segments = []
        board_samples = cv_data.get("board_samples")
        if not isinstance(board_samples, list):
            board_samples = []

        system_block = (
            "SYSTEM:\n"
            f"{ORCHESTRATOR_SYSTEM_BASE}\n\n"
            "You are also an expert educational psychologist.\n"
            f"Analyze this segment of a lecture (chunk {idx + 1} of "
            f"{total_chunks}, minutes {start_min}-{end_min}) and respond "
            "ONLY with valid JSON. No markdown, no explanation, no preamble."
        )

        user_block = f"""USER:
=== CV DATA (motion, board usage, slides) ===
{cv_json}

=== AUDIO SUMMARY (structured JSON for this window) ===
{summary_json}

=== AUDIO TRANSCRIPT (representative sample; timestamped) ===
{transcript_sample}

Speaker breakdown: {json.dumps(speaker_stats, ensure_ascii=False)}
Sentiment distribution: {json.dumps(sentiment_counts, ensure_ascii=False)}

RATING KURALLARI — ÇOK ÖNEMLİ:
- "Değerlendirilemedi" / "N/A" SADECE şu durumda kullan:
  organizasyon/gorsel_bilesenler → bu segmentte tahta/slayt sinyali yoksa
    (aşağıdaki görsel kurallara uy; ASLA "CV verilerine göre" yazma)
  organizasyon/teknik_bilesen → teknik sorun gözlemlenmemişse

Görsel bileşen değerlendirmesi için:
- board_usage_ratio = 0 veya yok ise: observation'da
  'Ders kaydında tahta kullanımı görüntülenemedi.' kullan.
- slide_segments = 0 veya yok ise: observation'da
  'Ders kaydında slayt gösterimi görüntülenemedi.' kullan.
- İkisi de yoksa observation:
  'Ders kaydında tahta veya slayt kullanımı görüntülenemedi.
  Görsel materyal kullanımı tespit edilemedi.'
- ASLA "CV verilerine göre" yazma.

- Diğer TÜM metrikler için mutlaka İyi / Geliştirilmeli / Yetersiz ver.
  Transkriptte doğrudan kanıt olmasa bile:
  - Olumsuz kanıt yoksa → İyi ver
  - Eksiklik varsa → Geliştirilmeli ver
  - Hiç yapılmamışsa → Yetersiz ver

- "Bu zaman aralığında gözlem yapılamadı" veya
  "veri bulunmamaktadır" YAZMA. Her metriğe rating ver.

Observe the following metrics for this lecture segment and note specific
timestamps as evidence. For each metric provide:
  - rating: "İyi" | "Geliştirilmeli" | "Yetersiz" | "Değerlendirilemedi"
    (Değerlendirilemedi yalnızca yukarıdaki iki organizasyon özelinde.)
  - observation: concrete observation with timestamps if available
    (e.g. "(00:13:37) Eğitmen öğrenci çalışmasını takdir etti.")
  - improvement_tip: rating "İyi" ise boş string.
    "Geliştirilmeli" veya "Yetersiz" ise somut, uygulanabilir öneri.
    improvement_tip için:
    - Veri yoksa → boş string "" bırak
    - ASLA "veri olmadığı için öneri yapılamıyor" yazma

Metrics to evaluate:
  ILETISIM: ders_dinamikleri, mod_tutum, saygi_sinirlar, tesvik_motivasyon,
            hatalar, acik_uclu_sorular, empati_destekleyici, etik_degerler
  HAZIRLIK: ders_akisi_tempo, konu_bilgisi, aciklama_netligi, rasyonel_ipucu
  ORGANIZASYON: gorsel_bilesenler, konusma_ses_tonu, teknik_bilesen,
                zamanlama
  DERS_YAPISI (boolean - was it observed in this segment?):
    isinma, onceki_ders_gozden, onceki_odev, hedefler,
    ozet, gelecek_odev, kapanis

DERS YAPISI TESPİT KURALLARI — her madde için transcript'te
BU TÜRKÇE İFADELERİ ara:

Isınma (completed=true):
  'merhaba', 'nasılsın', 'hoş geldin', 'kameranı aç',
  dersin ilk 10 dakikasında selamlama varsa

Önceki dersin gözden geçirilmesi (completed=true):
  'geçen hafta', 'geçen ders', 'geçen derste', 'önceki ders',
  'hatırlıyor musun', 'geçen sefer', 'daha önce yaptık'

Önceki ödevin tartışılması (completed=true):
  'ödev', 'ödevi', 'ödeviniz', 'ödevini', 'ödevler',
  'gönderdiniz mi', 'yaptınız mı', 'geçen haftanın ödevi'

Hedefler ve beklenen sonuç (completed=true):
  'bugün', 'bu derste', 'hedefimiz', 'amacımız',
  'öğreneceğiz', 'yapacağız', 'işleyeceğiz', 'bugünün dersi'

Özet (completed=true):
  'bugün yaptık', 'öğrendik', 'işledik', 'bitirmeden önce',
  'tekrar edelim', 'özet', 'özetleyelim', 'hatırlatalım'

Gelecek ödevin tartışılması (completed=true):
  'ödev', 'ödeviniz', 'gelecek hafta', 'bir sonraki ders',
  'yapmanızı istiyorum', 'gönderin', 'teslim'

Kapanış (completed=true):
  'görüşürüz', 'hoşça kal', 'iyi dersler', 'bay bay',
  'haftaya görüşürüz', 'güle güle', 'dersi bitir'

ÖNEMLİ: Bu kelimeleri TÜM transcript'te ara, sadece
son 5 dakikada değil. 'ödev' kelimesi dersin herhangi
bir yerinde geçiyorsa Önceki ödevin tartışılması=true
VE Gelecek ödevin tartışılması=true olarak işaretle.

GÖZLEM KALİTESİ KURALLARI:
- Her observation minimum 2 cümle olmalı
- Her cümle somut ve o derse özgü olmalı
- En az 1 timestamp içermeli: (SS:DD:SS) formatında
- Övgü cümlesi + ne yapılabilirdi cümlesi dengeli olmalı
- ASLA şablon cümle kullanma ("daha tutarlı uygulama için...")

ÖRNEK observation (Geliştirilmeli):
"Ders boyunca öğrencilere yöneltilen sorular çoğunlukla
kapalı uçluydu. (00:14:18) anında 'Bunu hatırlıyor musun?'
sorusu öğrenciye evet/hayır cevabı verdirdi; oysa 'Bu
konuyu nasıl açıklardın?' gibi bir soru daha derin
düşünmeyi tetiklerdi."

ÖRNEK improvement_tip:
"Ders planına 2-3 'öğrenci açıklar' momenti eklenebilir;
yeni kavram öncesi 'Siz olsaydınız nasıl yapardınız?'
sorusu sorulabilir."

GÖRSEL BİLEŞENLER DEĞERLENDİRMESİ:
Sayılar (üstteki CV DATA JSON’undan):
- board_usage_ratio: {board_usage_ratio}
- slide_segments sayısı: {len(slide_segments)}
- OCR ile tespit edilen yazı var mı: {bool(board_samples)}

Metin kuralları (gözlem metni; ASLA "CV verilerine göre" yazma):
- board_usage_ratio = 0 veya yok ise: 'Ders kaydında tahta kullanımı görüntülenemedi.'
- slide_segments = 0 veya yok ise: 'Ders kaydında slayt gösterimi görüntülenemedi.'
- İkisi de yoksa: 'Ders kaydında tahta veya slayt kullanımı görüntülenemedi.
  Görsel materyal kullanımı tespit edilemedi.'

Eşikler (rating ile birlikte kullan):
- board_usage_ratio > 0.3 ise tahta aktif kullanılmış say → İyi (somut gözlemle)
- slide_segments > 0 ise slayt kullanılmış say → İyi (somut gözlemle)
- İkisi de belirgin şekilde 0/yok ise → Geliştirilmeli veya yukarıdaki
  "Değerlendirilemedi" kuralına uy

Respond with this exact JSON schema:
{{
  "chunk_index": {idx},
  "start_sec": {chunk['start_sec']},
  "end_sec": {chunk['end_sec']},
  "iletisim": {{
    "<metric_key>": {{"rating": "...", "observation": "...", "improvement_tip": "..."}}
  }},
  "hazirlik": {{
    "<metric_key>": {{"rating": "...", "observation": "...", "improvement_tip": "..."}}
  }},
  "organizasyon": {{
    "<metric_key>": {{"rating": "...", "observation": "...", "improvement_tip": "..."}}
  }},
  "ders_yapisi": {{
    "isinma": false, "onceki_ders_gozden": false, "onceki_odev": false,
    "hedefler": false, "ozet": false, "gelecek_odev": false, "kapanis": false
  }},
  "highlight_moments": [
    {{"timestamp_sec": 0, "description": "...", "type": "..."}}
  ],
  "strengths": ["..."],
  "issues": ["..."]
}}
"""
        return f"{system_block}\n\n{user_block}"

    # ------------------------------------------------------------------ #
    #  Step 4 - merge
    # ------------------------------------------------------------------ #
    async def _merge_chunks(
        self,
        video_id: str,
        chunk_analyses: List[Dict[str, Any]],
        audio_result: AudioAnalysisResult,
        duration_min: int,
    ) -> Dict[str, Any]:
        with self._stage(video_id, "merge"):
            try:
                prompt = self._build_merge_prompt(
                    chunk_analyses, audio_result, duration_min
                )
                text = await self._generate_text_with_fallback(
                    video_id=video_id,
                    purpose="merge",
                    contents=prompt,
                )
                return _parse_gemini_json(text, video_id=video_id)
            except JSONParseError:
                raise
            except Exception as exc:
                raise MergeError(
                    f"Gemini merge call failed: {exc}", video_id=video_id
                ) from exc

    @staticmethod
    def _total_duration_min(
        audio_result: AudioAnalysisResult,
        chunk_analyses: List[Dict[str, Any]],
    ) -> int:
        end_ms = 0
        for seg in audio_result.segments:
            if seg.end_ms > end_ms:
                end_ms = seg.end_ms
        duration_sec = end_ms // 1000
        for c in chunk_analyses:
            duration_sec = max(duration_sec, int(c.get("end_sec", 0)))
        return max(1, duration_sec // 60)

    def _build_merge_prompt(
        self,
        chunk_analyses: List[Dict[str, Any]],
        audio_result: AudioAnalysisResult,
        duration_min: int,
    ) -> str:
        chunks_json = _truncate_text(
            json.dumps(chunk_analyses, ensure_ascii=False, default=str),
            _MAX_MERGE_CHUNKS_CHARS,
            "merge_chunks",
        )

        system_block = (
            "SYSTEM:\n"
            f"{ORCHESTRATOR_SYSTEM_BASE}\n\n"
            "You are also an expert educational psychologist.\n"
            "You have received per-segment analyses of a full lecture.\n"
            "Synthesize them into one final QA report in Turkish, matching "
            "the style of a professional teaching quality assessor.\n"
            "Respond ONLY with valid JSON. No markdown."
        )

        user_block = f"""USER:
Number of chunks: {len(chunk_analyses)}
Ders süresi: {duration_min} dakika
Konuşma hızı: {audio_result.speaking_pace_wpm:.0f} kelime/dakika
Sessizlik oranı: {audio_result.silence_ratio:.1%}
Chunk analyses: {chunks_json}

Rules:
- If a metric is "İyi" in all chunks -> final rating "İyi"
- If any chunk is "Yetersiz" -> final rating "Yetersiz" and count as stop_faktor
- Otherwise -> "Geliştirilmeli"
- For ders_yapisi: completed=true if observed in at least one chunk.
- speaking_time_rating: derive from audio silence_ratio and pace_wpm
    satisfactory = pace 120-160 wpm, silence_ratio < 0.2
    too_much = silence_ratio > 0.35
    too_little = pace > 180 wpm
- genel_sonuc: one of
    "Beklentilere uygundu." | "Beklentilerin altında." |
    "Beklentilerin üzerinde."
  derived from the İyi/Geliştirilmeli/Yetersiz ratio.
- stop_faktor: count of "Yetersiz" rated metrics.
- observation, improvement_tip and feedback_metni must be Turkish.
- do not use English words in free-text fields.

ÖRNEK RAPOR (bu kalitede yaz; stil ve somutluk seviyesini taklit et, metni aynen kopyalama):

feedback_metni örneği:
"Merhaba Hocam,

Ders boyunca öğrencilerle kurduğunuz samimi bağ ve
pozitif enerji dikkat çekiciydi. Yüz ifadesi özetine göre
%99 gülümseme oranıyla dersin tamamında olumlu bir
atmosfer yarattınız. (00:07:45) anında teknik sorun
yaşanmasına rağmen sakinliğinizi korumanız ve dersi
kesintisiz sürdürmeniz profesyonelliğinizin göstergesiydi.

Dersin güçlü anları arasında (00:14:01) anında Mete'nin
önceki çalışmasını fark edip takdir etmeniz öne çıkıyor.
Bu tür bireysel geri bildirimler öğrenci motivasyonunu
doğrudan etkiliyor. (00:27:01) anında Mila'nın kamera
kontrolündeki zorluğunu görsel anlatımla aşmanız ise
farklı öğrenme stillerine duyarlılığınızı gösteriyor.

Geliştirilebilecek tek alan açık uçlu soru kullanımı.
(00:14:18) anındaki soru öğrencinin düşüncesini
derinleştirme fırsatı yaratabilirdi. 'Bu tasarımı neden
böyle yaptın?' gibi sorular öğrencinin analitik
düşünmesini tetikler.

Emeğiniz ve öğrencilere olan bağlılığınız için teşekkür
eder, başarılarınızın devamını dilerim."

observation örneği (İyi için):
"Eğitmen (00:13:37) anında 'Gayet güzel açıkladığın
aşamaları' diyerek öğrencinin başarısını somut olarak
takdir etmiştir. Bu tür spesifik övgüler, genel
'aferin'lerden çok daha etkili bir pekiştirme sağlar."

observation örneği (Geliştirilmeli için):
"Ders boyunca sorular çoğunlukla kapalı uçlu yapıda
sorulmuştur. (00:14:18) anında 'Bunu hatırlıyor musun?'
şeklinde sorulan soru, öğrenciye evet/hayır cevabı
verdirmiştir. Oysa 'Bu konuyu nasıl açıklardın?' gibi
bir soru öğrencinin kendi cümleleriyle düşünmesini
sağlayabilirdi."

improvement_tip örneği:
"Açık uçlu sorular sormak için ders planına 2-3
'öğrenci açıklar' momenti eklenebilir. Örneğin
yeni bir kavram tanıtılmadan önce 'Bu kavramı daha
önce nerede gördünüz?' sorusu sorulabilir."

KURALLAR (feedback_metni, gözlemler ve öneriler):
- feedback_metni en az 200 kelime olmalı; "Merhaba Hocam," ile başla
- Her paragrafta somut en az bir timestamp (ör. (00:14:01)) kullan
- Övgü ve eleştiri dengeli olmalı (kabaca 2:1 — övgü ağırlıklı)
- Ton samimi ve destekleyici; öğretmeni meslektaş gibi muhatap al
- ASLA robotik, şablon veya bu örnekteki cümleleri birebir tekrar etme
- Her gözlem ve paragraf bu derse özgü olmalı; genel klise yazma
- Paragraf 4: kısa kapanış teşekkürü

Respond with this exact QAReport JSON schema:
{{
  "instructor_name": "",
  "course": "",
  "group": "",
  "lesson_date": "",
  "module": 0,
  "lesson_number": 0,
  "expected_duration_min": {duration_min},
  "actual_duration_min": {duration_min},
  "speaking_time_rating": "satisfactory",
  "iletisim": {{
    "ders_dinamikleri":  {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "mod_tutum":         {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "saygi_sinirlar":    {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "tesvik_motivasyon": {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "hatalar":           {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "acik_uclu_sorular": {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "empati_destekleyici": {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "etik_degerler":     {{"rating": "...", "observation": "...", "improvement_tip": "..."}}
  }},
  "hazirlik": {{
    "ders_akisi_tempo":  {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "konu_bilgisi":      {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "aciklama_netligi":  {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "rasyonel_ipucu":    {{"rating": "...", "observation": "...", "improvement_tip": "..."}}
  }},
  "organizasyon": {{
    "gorsel_bilesenler": {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "konusma_ses_tonu":  {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "teknik_bilesen":    {{"rating": "...", "observation": "...", "improvement_tip": "..."}},
    "zamanlama":         {{"rating": "...", "observation": "...", "improvement_tip": "..."}}
  }},
  "ders_yapisi": [
    {{"item": "Isınma", "completed": false}},
    {{"item": "Önceki dersin gözden geçirilmesi", "completed": false}},
    {{"item": "Önceki ödevin tartışılması", "completed": false}},
    {{"item": "Hedefler ve beklenen sonuç", "completed": false}},
    {{"item": "Özet", "completed": false}},
    {{"item": "Gelecek ödevin tartışılması", "completed": false}},
    {{"item": "Kapanış", "completed": false}}
  ],
  "genel_sonuc": "Beklentilere uygundu.",
  "yeterlilikler": "Geliştirilmeli",
  "stop_faktor": 0,
  "feedback_metni": "Merhaba Hocam, ..."
}}
"""
        return f"{system_block}\n\n{user_block}"

    # ------------------------------------------------------------------ #
    #  Step 5 - build final model + save
    # ------------------------------------------------------------------ #
    def _build_final_report(
        self,
        video_id: str,
        merged: Dict[str, Any],
        duration_min: int,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> QAReport:
        try:
            meta = metadata if isinstance(metadata, dict) else {}
            iletisim = self._coerce_metric_dict(
                merged.get("iletisim"), ILETISIM_KEYS
            )
            hazirlik = self._coerce_metric_dict(
                merged.get("hazirlik"), HAZIRLIK_KEYS
            )
            organizasyon = self._coerce_metric_dict(
                merged.get("organizasyon"), ORGANIZASYON_KEYS
            )
            ders_yapisi = self._coerce_ders_yapisi(merged.get("ders_yapisi"))
            exp_min = _meta_expected_duration_min(meta, merged, duration_min)

            report = QAReport(
                video_id=video_id,
                instructor_name=_meta_str_first(
                    meta, merged, "instructor_name"
                ),
                course=_meta_str_first(meta, merged, "course"),
                group=_meta_str_first(meta, merged, "group"),
                lesson_date=_meta_str_first(meta, merged, "lesson_date"),
                module=_meta_int_first(meta, merged, "module"),
                lesson_number=_meta_lesson_number(meta, merged),
                expected_duration_min=exp_min,
                actual_duration_min=int(
                    merged.get("actual_duration_min") or duration_min
                ),
                speaking_time_rating=str(
                    merged.get("speaking_time_rating") or "satisfactory"
                ),
                iletisim=iletisim,
                hazirlik=hazirlik,
                organizasyon=organizasyon,
                ders_yapisi=ders_yapisi,
                genel_sonuc=str(
                    merged.get("genel_sonuc") or "Beklentilere uygundu."
                ),
                yeterlilikler=_coerce_rating(
                    merged.get("yeterlilikler"), default=Rating.acceptable
                ),
                stop_faktor=int(merged.get("stop_faktor") or 0),
                feedback_metni=str(merged.get("feedback_metni") or ""),
                generated_at=datetime.now(tz=timezone.utc),
            )
            self._apply_text_quality_fallbacks(report)
            return report
        except Exception as exc:
            raise OrchestratorError(
                f"failed to build QAReport: {exc}", video_id=video_id
            ) from exc

    @staticmethod
    def _coerce_metric_dict(
        raw: Any, expected_keys: List[str]
    ) -> Dict[str, MetricResult]:
        raw = raw if isinstance(raw, dict) else {}
        out: Dict[str, MetricResult] = {}
        for key in expected_keys:
            value = raw.get(key) or {}
            if not isinstance(value, dict):
                value = {}
            out[key] = MetricResult(
                rating=_coerce_rating(value.get("rating"), Rating.na),
                observation=str(value.get("observation") or ""),
                improvement_tip=str(value.get("improvement_tip") or ""),
            )
        return out

    @staticmethod
    def _apply_text_quality_fallbacks(report: QAReport) -> None:
        def _improvement_tip_is_template_junk(tip: str) -> bool:
            u = tip.casefold()
            return (
                "mikro geri bildirimler" in u
                or "daha tutarlı uygulama" in u
            )

        def sanitize_metric(metric: MetricResult, label: str) -> None:
            obs = (metric.observation or "").strip()
            tip = (metric.improvement_tip or "").strip()

            if not obs or _looks_english(obs):
                metric.observation = (
                    f"{label} için ders boyunca sınırlı kanıt gözlemlendi; "
                    "değerlendirme mevcut veriye göre yapıldı."
                )

            if metric.rating == Rating.good:
                metric.improvement_tip = ""
                return

            if not tip:
                metric.improvement_tip = ""
                return

            if _improvement_tip_is_template_junk(tip) or _looks_english(tip):
                metric.improvement_tip = ""
                return

            if len(tip) <= 30:
                metric.improvement_tip = ""
                return

            metric.improvement_tip = tip

        section_labels = {
            "iletisim": "İletişim",
            "hazirlik": "Hazırlık",
            "organizasyon": "Organizasyon",
        }
        for section_name, section in (
            ("iletisim", report.iletisim),
            ("hazirlik", report.hazirlik),
            ("organizasyon", report.organizasyon),
        ):
            section_label = section_labels[section_name]
            for metric_key, metric in section.items():
                fix_metric_result_ratings(metric)
                sanitize_metric(metric, f"{section_label}/{metric_key}")

        feedback = (report.feedback_metni or "").strip()
        if not feedback or _looks_english(feedback):
            report.feedback_metni = _build_feedback_fallback(report)

    @staticmethod
    def _derive_duration_min(audio_result: AudioAnalysisResult) -> int:
        """Wall-clock lecture length for reports (minutes).

        Prefer explicit ``duration_ms`` when present; otherwise infer from the
        latest transcript segment end (not segment count).
        """
        duration_ms = getattr(audio_result, "duration_ms", None)
        if isinstance(duration_ms, (int, float)) and duration_ms > 0:
            return max(1, int(duration_ms / 60000))
        segs = getattr(audio_result, "segments", None) or []
        if segs:
            end_ms = max(int(s.end_ms) for s in segs)
            if end_ms > 0:
                return max(1, end_ms // 60000)
        return 1

    @staticmethod
    def _coerce_ders_yapisi(raw: Any) -> List[LessonStructureItem]:
        # The schema expects a list of {item, completed}; the prompt may
        # also return a dict keyed by snake_case. Handle both.
        items: List[LessonStructureItem] = []

        if isinstance(raw, list):
            for entry in raw:
                if not isinstance(entry, dict):
                    continue
                items.append(
                    LessonStructureItem(
                        item=str(entry.get("item", "")),
                        completed=bool(entry.get("completed", False)),
                    )
                )
            if items:
                return items

        # Canonical fallback driven by the expected 7 items.
        source = raw if isinstance(raw, dict) else {}
        for key, display in DERS_YAPISI_ITEMS:
            completed = bool(source.get(key, False))
            items.append(
                LessonStructureItem(item=display, completed=completed)
            )
        return items

    async def _save_report(
        self, video_id: str, report: QAReport
    ) -> None:
        with self._stage(video_id, "report_save"):
            try:
                bucket = self._storage_client.bucket(self.buckets.processed)
                blob = bucket.blob(self.buckets.report_path(video_id))
                payload = json.dumps(
                    report.model_dump(),
                    ensure_ascii=False,
                    indent=2,
                    default=str,
                )
                await asyncio.to_thread(
                    blob.upload_from_string,
                    payload,
                    content_type="application/json; charset=utf-8",
                )
            except Exception as exc:
                raise OrchestratorError(
                    f"failed to upload report to gs://"
                    f"{self.buckets.processed}/"
                    f"{self.buckets.report_path(video_id)}: {exc}",
                    video_id=video_id,
                ) from exc

    # ------------------------------------------------------------------ #
    #  Helpers
    # ------------------------------------------------------------------ #
    @contextmanager
    def _stage(self, video_id: str, stage: str) -> Iterator[None]:
        start = time.time()
        logger.info("[%s] stage=%s START", video_id, stage)
        self._emit_status("stage_start", stage)
        try:
            yield
        except Exception:
            elapsed = time.time() - start
            self._emit_status("stage_failed", f"{stage} elapsed_sec={elapsed:.2f}")
            logger.exception(
                "[%s] stage=%s FAILED after %.2fs",
                video_id,
                stage,
                elapsed,
            )
            raise
        else:
            elapsed = time.time() - start
            self._emit_status("stage_end", f"{stage} elapsed_sec={elapsed:.2f}")
            logger.info(
                "[%s] stage=%s END (%.2fs)", video_id, stage, elapsed
            )


# --------------------------------------------------------------------------- #
#  Module-level helpers (also importable for tests)
# --------------------------------------------------------------------------- #
def _parse_gemini_json(
    response_text: str, *, video_id: Optional[str] = None
) -> Dict[str, Any]:
    """Strip ```json fences and parse. Raise JSONParseError on failure."""
    if response_text is None:
        raise JSONParseError(
            "Gemini returned no text", raw_text="", video_id=video_id
        )

    text = response_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # Drop opening fence (``` or ```json)
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        # Drop closing fence if present
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise JSONParseError(
            f"invalid JSON from Gemini: {exc}",
            raw_text=response_text,
            video_id=video_id,
        ) from exc

    if not isinstance(data, dict):
        raise JSONParseError(
            "Gemini response was valid JSON but not an object",
            raw_text=response_text,
            video_id=video_id,
        )
    return data


def _extract_response_text(response: Any) -> str:
    """Extract text from a ``google.genai`` response object."""
    text = getattr(response, "text", None)
    if text:
        return text

    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            ptext = getattr(part, "text", None)
            if ptext:
                return ptext
    return ""


def _extract_groq_response_text(response: Any) -> str:
    """Extract text from a ``groq`` chat completion response."""
    choices = getattr(response, "choices", None) or []
    if not choices:
        return ""
    message = getattr(choices[0], "message", None)
    if not message:
        return ""
    content = getattr(message, "content", None)
    return content or ""


def _looks_english(text: str) -> bool:
    tokens = [t.strip(".,:;!?()[]{}\"'").lower() for t in text.split()]
    markers = sum(1 for t in tokens if t in _ENGLISH_MARKERS)
    return markers >= 2


def _build_feedback_fallback(report: QAReport) -> str:
    total_metrics = 0
    good_metrics = 0
    needs_improvement: list[str] = []

    for group in (report.iletisim, report.hazirlik, report.organizasyon):
        for key, metric in group.items():
            total_metrics += 1
            if metric.rating == Rating.good:
                good_metrics += 1
            elif metric.rating in (Rating.acceptable, Rating.poor):
                needs_improvement.append(key.replace("_", " "))

    if total_metrics == 0:
        positive_ratio = 0.0
    else:
        positive_ratio = good_metrics / total_metrics

    strengths = (
        "dersin akışını koruma, sınıf iletişimini sürdürme ve öğrenen odağını canlı tutma"
        if positive_ratio >= 0.5
        else "dersin temel akışını koruma ve hedeflenen kazanımlara odaklanma"
    )
    if needs_improvement:
        improvement_text = ", ".join(needs_improvement[:3])
        development = (
            f"Gelişim alanı olarak özellikle {improvement_text} başlıklarında "
            "daha planlı mikro stratejiler uygulanması önerilir."
        )
    else:
        development = (
            "Genel tablo güçlü; mevcut yaklaşımı koruyup aynı tutarlılığı "
            "bir sonraki derslerde sürdürmeniz önerilir."
        )

    return (
        "Merhaba Hocam,\n\n"
        "Dersinizin genel çerçevesi incelendiğinde, sınıf yönetimi ve anlatım "
        "dengesinde olumlu bir profil görülmektedir.\n\n"
        f"Güçlü yönleriniz arasında {strengths} öne çıkmaktadır. "
        "Bu yaklaşım öğrencilerin derse katılımını destekleyen bir temel sunmaktadır.\n\n"
        f"{development}\n\n"
        "Emeğiniz için teşekkür eder, başarılı dersler dileriz."
    )


def _coerce_rating(value: Any, default: Rating) -> Rating:
    if isinstance(value, Rating):
        return value
    if not isinstance(value, str):
        return default
    normalised = value.strip().lower()
    mapping = {
        "iyi": Rating.good,
        "geliştirilmeli": Rating.acceptable,
        "gelistirilmeli": Rating.acceptable,
        "yetersiz": Rating.poor,
        "değerlendirilemedi": Rating.na,
        "degerlendirilemedi": Rating.na,
        "good": Rating.good,
        "acceptable": Rating.acceptable,
        "poor": Rating.poor,
        "n/a": Rating.na,
        "na": Rating.na,
        "none": Rating.na,
    }
    return mapping.get(normalised, default)


def _extract_frame_ts_sec(frame: Any) -> Optional[float]:
    if not isinstance(frame, dict):
        return None
    for key in ("timestamp_sec", "time_sec", "t_sec", "second", "sec"):
        val = frame.get(key)
        if isinstance(val, (int, float)):
            return float(val)
    for key in ("timestamp_ms", "time_ms", "t_ms"):
        val = frame.get(key)
        if isinstance(val, (int, float)):
            return float(val) / 1000.0
    for key in ("timestamp", "time"):
        val = frame.get(key)
        if isinstance(val, (int, float)):
            # Heuristic: large numbers likely milliseconds, small likely sec.
            return float(val) / 1000.0 if val > 10_000 else float(val)
    return None


def _frame_in_range(frame: Any, start_sec: int, end_sec: int) -> bool:
    ts = _extract_frame_ts_sec(frame)
    if ts is None:
        return True  # no timestamp -> include in every chunk (safe fallback)
    return start_sec <= ts < end_sec


def _compact_frame(frame: Any) -> Any:
    """Strip verbose per-frame fields to reduce token count.

    Keep timestamp + key metrics; drop raw landmark arrays, pixel coords, etc.
    """
    if not isinstance(frame, dict):
        return frame
    keep_keys = {
        "timestamp_sec", "time_sec", "t_sec", "second", "sec",
        "timestamp_ms", "time_ms", "t_ms", "timestamp", "time",
        "gesture", "gesture_label", "posture", "movement",
        "board_visible", "face_visible", "teacher_visible",
        "region", "zone", "position",
        "speaking", "looking_at_students",
    }
    return {k: v for k, v in frame.items() if k in keep_keys}


def _truncate_text(text: str, max_chars: int, label: str) -> str:
    """Truncate text to max_chars with a warning marker."""
    if len(text) <= max_chars:
        return text
    logger.warning(
        "prompt %s truncated from %d to %d chars",
        label, len(text), max_chars,
    )
    return text[:max_chars] + f"\n... [{label} truncated, {len(text) - max_chars} chars omitted]"
