"""Gemini-backed orchestrator that produces the final QAReport.

Pipeline:

    1. Load CV JSON  (``gs://{bucket}/data/visual/{video_id}.json``)
    2. Chunk audio + CV data into ``chunk_minutes`` windows
    3. Analyse every chunk with Gemini in parallel
    4. Merge all chunk analyses into a single QAReport via Gemini
    5. Upload the QAReport JSON to
       ``gs://{bucket}/data/reports/{video_id}.json`` and return it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple

from google import genai
from google.cloud import storage

from src.audio.schemas import AudioAnalysisResult, TranscriptSegment
from src.audio.transcript_format import build_formatted_transcript_for_prompt
from src.config import BucketConfig

from .exceptions import (
    ChunkAnalysisError,
    JSONParseError,
    MergeError,
    OrchestratorError,
)
from .report_schema import (
    LessonStructureItem,
    MetricResult,
    QAReport,
    Rating,
)

logger = logging.getLogger(__name__)


ORCHESTRATOR_SYSTEM_BASE = (
    "You are analyzing a lecture based on structured data only.\n"
    "You do NOT have access to the video. Your inputs are:\n"
    "(a) CV analysis JSON: motion tracking, board usage, OCR text\n"
    "(b) Timestamped transcript with speaker labels and sentiment scores\n"
    "Use ONLY these inputs. Cite timestamps as evidence in observations."
)


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
    """Generate a ``QAReport`` from CV + audio data using Gemini."""

    def __init__(
        self,
        gemini_api_key: str,
        buckets: BucketConfig,
        model: str = "gemini-flash-latest",
        chunk_minutes: int = 30,
    ) -> None:
        if not gemini_api_key:
            raise ValueError("gemini_api_key is required")
        if buckets is None:
            raise ValueError("buckets (BucketConfig) is required")
        if chunk_minutes <= 0:
            raise ValueError("chunk_minutes must be positive")

        self.buckets = buckets
        self.chunk_minutes = chunk_minutes
        self.model_name = model

        self._genai_client = genai.Client(api_key=gemini_api_key)

        self._storage_client: storage.Client = storage.Client()

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

        # STEP 3 - analyse each chunk in parallel -------------------------
        chunk_analyses = await self._analyze_all_chunks(video_id, chunks)
        if not chunk_analyses:
            raise OrchestratorError(
                "every chunk analysis failed", video_id=video_id
            )

        # STEP 4 - merge --------------------------------------------------
        merged = await self._merge_chunks(
            video_id, chunk_analyses, audio_result
        )

        # STEP 5 - build final model + save -------------------------------
        report = self._build_final_report(video_id, merged)
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
            try:
                bucket = self._storage_client.bucket(self.buckets.processed)
                blob = bucket.blob(self.buckets.cv_path(video_id))
                payload = await asyncio.to_thread(blob.download_as_text)
                data = json.loads(payload)
                if not isinstance(data, dict):
                    raise ValueError("CV JSON top-level must be an object")
                return data
            except Exception as exc:
                raise OrchestratorError(
                    f"failed to load CV JSON from gs://"
                    f"{self.buckets.processed}/"
                    f"{self.buckets.cv_path(video_id)}: {exc}",
                    video_id=video_id,
                ) from exc

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
        """Best-effort slice of CV data that overlaps [start_sec, end_sec)."""
        sliced: Dict[str, Any] = {}

        for key, value in cv_data.items():
            if key == "motion_frames" and isinstance(value, list):
                sliced[key] = [
                    frame
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
        tasks = [
            self._analyze_single_chunk(video_id, c, total) for c in chunks
        ]
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
                response = await asyncio.to_thread(
                    self._genai_client.models.generate_content,
                    model=self.model_name,
                    contents=prompt,
                )
                text = _extract_response_text(response)
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

        cv_json = json.dumps(
            chunk["cv_data"], ensure_ascii=False, default=str
        )
        formatted_transcript = build_formatted_transcript_for_prompt(
            audio_segments
        )

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

=== AUDIO TRANSCRIPT SEGMENT (timestamped) ===
{formatted_transcript}

Speaker breakdown: {json.dumps(speaker_stats, ensure_ascii=False)}
Sentiment distribution: {json.dumps(sentiment_counts, ensure_ascii=False)}

Observe the following metrics for this lecture segment and note specific
timestamps as evidence. For each metric provide:
  - rating: "Good" | "Acceptable" | "Poor" | "N/A"
  - observation: concrete observation with timestamps if available
    (e.g. "(13:37) Instructor praised student work.")
  - improvement_tip: empty string if Good, specific tip otherwise

Metrics to evaluate:
  ILETISIM: ders_dinamikleri, mod_tutum, saygi_sinirlar, tesvik_motivasyon,
            hatalar, acik_uclu_sorular, empati_destekleyici, etik_degerler
  HAZIRLIK: ders_akisi_tempo, konu_bilgisi, aciklama_netligi, rasyonel_ipucu
  ORGANIZASYON: gorsel_bilesenler, konusma_ses_tonu, teknik_bilesen,
                zamanlama
  DERS_YAPISI (boolean - was it observed in this segment?):
    isinma, onceki_ders_gozden, onceki_odev, hedefler,
    ozet, gelecek_odev, kapanis

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
    ) -> Dict[str, Any]:
        with self._stage(video_id, "merge"):
            try:
                duration_min = self._total_duration_min(
                    audio_result, chunk_analyses
                )
                prompt = self._build_merge_prompt(
                    chunk_analyses, audio_result, duration_min
                )
                response = await asyncio.to_thread(
                    self._genai_client.models.generate_content,
                    model=self.model_name,
                    contents=prompt,
                )
                text = _extract_response_text(response)
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
        chunks_json = json.dumps(
            chunk_analyses, ensure_ascii=False, default=str
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
Total duration: {duration_min} minutes
Audio stats: silence_ratio={audio_result.silence_ratio}, \
pace_wpm={audio_result.speaking_pace_wpm}
Chunk analyses: {chunks_json}

Rules:
- If a metric is "Good" in all chunks -> final rating "Good"
- If any chunk is "Poor" -> final rating "Poor" and count as stop_faktor
- Otherwise -> "Acceptable"
- For ders_yapisi: completed=true if observed in at least one chunk.
- speaking_time_rating: derive from audio silence_ratio and pace_wpm
    satisfactory = pace 120-160 wpm, silence_ratio < 0.2
    too_much = silence_ratio > 0.35
    too_little = pace > 180 wpm
- feedback_metni: write in Turkish, warm professional tone, start with
  "Merhaba Hocam,", 3-4 paragraphs:
    1) genel olumlu gözlem
    2) güçlü yönler (timestamp örnekleriyle)
    3) gelişim alanı (varsa, nazikçe)
    4) kapanış teşekkür
- genel_sonuc: one of
    "Beklentilere uygundu." | "Beklentilerin altında." |
    "Beklentilerin üzerinde."
  derived from the Good/Acceptable/Poor ratio.
- stop_faktor: count of "Poor" rated metrics.

Respond with this exact QAReport JSON schema:
{{
  "instructor_name": "",
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
  "yeterlilikler": "Acceptable",
  "stop_faktor": 0,
  "feedback_metni": "Merhaba Hocam, ..."
}}
"""
        return f"{system_block}\n\n{user_block}"

    # ------------------------------------------------------------------ #
    #  Step 5 - build final model + save
    # ------------------------------------------------------------------ #
    def _build_final_report(
        self, video_id: str, merged: Dict[str, Any]
    ) -> QAReport:
        try:
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

            report = QAReport(
                video_id=video_id,
                instructor_name=str(merged.get("instructor_name", "")),
                lesson_date=str(merged.get("lesson_date", "")),
                module=int(merged.get("module") or 0),
                lesson_number=int(merged.get("lesson_number") or 0),
                expected_duration_min=int(
                    merged.get("expected_duration_min") or 0
                ),
                actual_duration_min=int(
                    merged.get("actual_duration_min") or 0
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
                payload = report.model_dump_json(indent=2)
                await asyncio.to_thread(
                    blob.upload_from_string,
                    payload,
                    content_type="application/json",
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
        try:
            yield
        except Exception:
            elapsed = time.time() - start
            logger.exception(
                "[%s] stage=%s FAILED after %.2fs",
                video_id,
                stage,
                elapsed,
            )
            raise
        else:
            elapsed = time.time() - start
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


def _coerce_rating(value: Any, default: Rating) -> Rating:
    if isinstance(value, Rating):
        return value
    if not isinstance(value, str):
        return default
    normalised = value.strip().lower()
    mapping = {
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
