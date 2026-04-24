"""AssemblyAI-backed audio analysis client.

Flow:

    1. If cached JSON exists at ``gs://{processed}/data/audio/{video_id}.json``,
       return it.
    2. Download the source MP4 from GCS to a tempfile.
    3. Submit the MP4 file path to AssemblyAI (local upload, not URL).
    4. Poll until completed/error.
    5. Parse into ``AudioAnalysisResult`` (including ``SentimentSummary``).
    6. Upload JSON + human-readable ``.txt`` transcript to the processed bucket.
    7. Delete tempfiles.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator, List, Optional

import assemblyai as aai
from google.cloud import storage

from src.config import BucketConfig

from .schemas import (
    AudioAnalysisResult,
    TranscriptSegment,
    build_sentiment_summary,
)
from .transcript_format import build_transcript_txt

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
#  Custom exception
# --------------------------------------------------------------------------- #
class AudioProcessingError(Exception):
    """Raised when any stage of the audio pipeline fails."""

    VALID_STAGES = {
        "download",
        "download_mp4",
        "upload_assemblyai",
        "transcription",
        "gcs_save",
    }

    def __init__(self, video_id: str, stage: str, message: str) -> None:
        self.video_id = video_id
        self.stage = stage
        self.message = message
        super().__init__(f"[{video_id}] stage={stage}: {message}")


# --------------------------------------------------------------------------- #
#  Client
# --------------------------------------------------------------------------- #
class AudioAnalysisClient:
    """Async wrapper that drives the full audio-analysis pipeline.

    The AssemblyAI Python SDK is synchronous, so every blocking call is
    executed inside ``asyncio.to_thread`` so the coroutine does not
    block the event loop.
    """

    _POLL_INTERVAL_SEC = 5

    def __init__(
        self,
        assemblyai_api_key: str,
        buckets: BucketConfig,
    ) -> None:
        if not assemblyai_api_key:
            raise ValueError("assemblyai_api_key is required")
        if buckets is None:
            raise ValueError("buckets (BucketConfig) is required")

        self.buckets = buckets
        self._api_key = assemblyai_api_key

        aai.settings.api_key = assemblyai_api_key

        self._storage_client: storage.Client = storage.Client()

    @staticmethod
    def _build_transcription_config() -> aai.TranscriptionConfig:
        """Build an AssemblyAI config compatible with old/new SDKs."""
        base_kwargs = {
            "speaker_labels": True,
            "sentiment_analysis": True,
            "auto_highlights": True,
        }
        try:
            return aai.TranscriptionConfig(
                **base_kwargs,
                speech_models=["universal-2"],
            )
        except TypeError:
            speech_model = getattr(getattr(aai, "SpeechModel", None), "best", None)
            if speech_model is not None:
                return aai.TranscriptionConfig(
                    **base_kwargs,
                    speech_model=speech_model,
                )
            return aai.TranscriptionConfig(**base_kwargs)

    # ------------------------------------------------------------------ #
    #  Public API
    # ------------------------------------------------------------------ #
    async def analyze(self, video_id: str) -> AudioAnalysisResult:
        """Run the full audio pipeline for a single video."""
        logger.info("[%s] AudioAnalysisClient.analyze started", video_id)
        overall_start = time.time()

        cached_result = await self._load_cached_result(video_id)
        if cached_result is not None:
            logger.info(
                "[%s] AudioAnalysisClient.analyze cache hit; returning "
                "existing transcript JSON",
                video_id,
            )
            logger.info(
                "[%s] AudioAnalysisClient.analyze completed in %.2fs",
                video_id,
                time.time() - overall_start,
            )
            return cached_result

        mp4_path: Optional[str] = None
        try:
            mp4_path = await self._download_mp4_to_tempfile(video_id)
            transcript_id = await self._submit_transcription(video_id, mp4_path)

            transcript = await self._wait_for_transcription(
                video_id, transcript_id
            )

            result = self._build_result(video_id, transcript)

            await self._save_result(video_id, result)
        finally:
            for path in (mp4_path,):
                if path and os.path.isfile(path):
                    try:
                        os.unlink(path)
                    except OSError:
                        logger.warning(
                            "[%s] failed to remove temp file %s",
                            video_id,
                            path,
                        )

        logger.info(
            "[%s] AudioAnalysisClient.analyze completed in %.2fs",
            video_id,
            time.time() - overall_start,
        )
        return result

    # ------------------------------------------------------------------ #
    #  Stage helpers
    # ------------------------------------------------------------------ #
    async def _load_cached_result(
        self, video_id: str
    ) -> Optional[AudioAnalysisResult]:
        """Return existing processed-bucket audio JSON if available."""
        with self._stage(video_id, "download"):
            try:
                bucket = self._storage_client.bucket(self.buckets.processed)
                blob = bucket.blob(
                    self.buckets.processed_audio_json_path(video_id)
                )
                exists = await asyncio.to_thread(blob.exists)
                if not exists:
                    return None

                payload = await asyncio.to_thread(blob.download_as_text)
                return AudioAnalysisResult.model_validate_json(payload)
            except Exception as exc:
                raise AudioProcessingError(
                    video_id,
                    "download",
                    f"failed reading cached transcript from gs://"
                    f"{self.buckets.processed}/"
                    f"{self.buckets.processed_audio_json_path(video_id)}: {exc}",
                ) from exc

    async def _download_mp4_to_tempfile(self, video_id: str) -> str:
        with self._stage(video_id, "download_mp4"):
            fd, mp4_path = tempfile.mkstemp(suffix=".mp4")
            os.close(fd)
            try:
                bucket = self._storage_client.bucket(self.buckets.videos)
                blob = bucket.blob(self.buckets.video_path(video_id))
                await asyncio.to_thread(blob.download_to_filename, mp4_path)
            except Exception as exc:
                try:
                    os.unlink(mp4_path)
                except OSError:
                    pass
                raise AudioProcessingError(
                    video_id,
                    "download_mp4",
                    f"failed to download gs://{self.buckets.videos}/"
                    f"{self.buckets.video_path(video_id)}: {exc}",
                ) from exc
            return mp4_path

    async def _submit_transcription(
        self,
        video_id: str,
        media_path: str,
    ) -> str:
        """Submit a local media file (MP4) to AssemblyAI."""
        with self._stage(video_id, "upload_assemblyai"):
            try:
                config = self._build_transcription_config()
                transcriber = aai.Transcriber(config=config)
                transcript = await asyncio.to_thread(
                    transcriber.submit, media_path
                )
                if transcript.id is None:
                    raise RuntimeError(
                        "AssemblyAI did not return a transcript id"
                    )
                return transcript.id
            except Exception as exc:
                raise AudioProcessingError(
                    video_id,
                    "upload_assemblyai",
                    f"AssemblyAI submit failed: {exc}",
                ) from exc

    async def _wait_for_transcription(
        self, video_id: str, transcript_id: str
    ) -> aai.Transcript:
        with self._stage(video_id, "transcription"):
            try:
                while True:
                    transcript = await asyncio.to_thread(
                        aai.Transcript.get_by_id, transcript_id
                    )
                    status = transcript.status
                    if status == aai.TranscriptStatus.completed:
                        return transcript
                    if status == aai.TranscriptStatus.error:
                        raise RuntimeError(
                            "AssemblyAI returned error: "
                            f"{getattr(transcript, 'error', 'unknown')}"
                        )
                    logger.info(
                        "[%s] transcription status=%s, polling again in %ds",
                        video_id,
                        status,
                        self._POLL_INTERVAL_SEC,
                    )
                    await asyncio.sleep(self._POLL_INTERVAL_SEC)
            except AudioProcessingError:
                raise
            except Exception as exc:
                raise AudioProcessingError(
                    video_id,
                    "transcription",
                    f"AssemblyAI polling failed: {exc}",
                ) from exc

    async def _save_result(
        self, video_id: str, result: AudioAnalysisResult
    ) -> None:
        with self._stage(video_id, "gcs_save"):
            try:
                bucket = self._storage_client.bucket(self.buckets.processed)
                json_blob = bucket.blob(
                    self.buckets.processed_audio_json_path(video_id)
                )
                txt_blob = bucket.blob(
                    self.buckets.processed_transcript_txt_path(video_id)
                )
                json_payload = result.model_dump_json(indent=2)
                txt_payload = build_transcript_txt(result.segments)

                await asyncio.to_thread(
                    json_blob.upload_from_string,
                    json_payload,
                    content_type="application/json",
                )
                await asyncio.to_thread(
                    txt_blob.upload_from_string,
                    txt_payload,
                    content_type="text/plain; charset=utf-8",
                )
            except Exception as exc:
                raise AudioProcessingError(
                    video_id,
                    "gcs_save",
                    f"GCS upload to gs://{self.buckets.processed}/ failed: {exc}",
                ) from exc

    # ------------------------------------------------------------------ #
    #  Parsing
    # ------------------------------------------------------------------ #
    def _build_result(
        self, video_id: str, transcript: aai.Transcript
    ) -> AudioAnalysisResult:
        full_text = transcript.text or ""
        segments = self._build_segments(transcript)
        highlights = self._build_highlights(transcript)
        duration_ms = self._duration_ms(transcript)

        word_count = len(full_text.split()) if full_text else 0
        if duration_ms > 0:
            speaking_pace_wpm = word_count / (duration_ms / 60_000.0)
        else:
            speaking_pace_wpm = 0.0

        silence_ratio = self._silence_ratio(transcript, duration_ms)
        sentiment_summary = build_sentiment_summary(segments)

        return AudioAnalysisResult(
            video_id=video_id,
            full_transcript=full_text,
            segments=segments,
            highlights=highlights,
            speaking_pace_wpm=round(speaking_pace_wpm, 2),
            silence_ratio=round(silence_ratio, 4),
            sentiment_summary=sentiment_summary,
            processed_at=datetime.now(tz=timezone.utc),
        )

    @staticmethod
    def _build_segments(
        transcript: aai.Transcript,
    ) -> List[TranscriptSegment]:
        """Build `TranscriptSegment`s from AAI sentiment results.

        Sentiment-analysis results contain speaker, text, start, end,
        sentiment and confidence, which is the richest combined source.
        If sentiment analysis is missing we fall back to utterances.
        """
        segments: List[TranscriptSegment] = []
        sentiment_results = (
            getattr(transcript, "sentiment_analysis_results", None) or []
        )

        if sentiment_results:
            for item in sentiment_results:
                segments.append(
                    TranscriptSegment(
                        speaker=str(getattr(item, "speaker", "") or "?"),
                        start_ms=int(getattr(item, "start", 0) or 0),
                        end_ms=int(getattr(item, "end", 0) or 0),
                        text=str(getattr(item, "text", "") or ""),
                        sentiment=str(
                            getattr(item, "sentiment", "NEUTRAL") or "NEUTRAL"
                        ).upper(),
                        sentiment_confidence=float(
                            getattr(item, "confidence", 0.0) or 0.0
                        ),
                    )
                )
            return segments

        for utt in getattr(transcript, "utterances", None) or []:
            segments.append(
                TranscriptSegment(
                    speaker=str(getattr(utt, "speaker", "?") or "?"),
                    start_ms=int(getattr(utt, "start", 0) or 0),
                    end_ms=int(getattr(utt, "end", 0) or 0),
                    text=str(getattr(utt, "text", "") or ""),
                    sentiment="NEUTRAL",
                    sentiment_confidence=0.0,
                )
            )
        return segments

    @staticmethod
    def _build_highlights(transcript: aai.Transcript) -> List[str]:
        auto = getattr(transcript, "auto_highlights_result", None)
        if not auto:
            return []
        results = getattr(auto, "results", None) or []
        return [
            str(getattr(r, "text", ""))
            for r in results
            if getattr(r, "text", None)
        ]

    @staticmethod
    def _duration_ms(transcript: aai.Transcript) -> int:
        """AssemblyAI exposes `audio_duration` in seconds (float/int)."""
        duration_sec = getattr(transcript, "audio_duration", None) or 0
        return int(float(duration_sec) * 1000)

    @staticmethod
    def _silence_ratio(
        transcript: aai.Transcript, duration_ms: int
    ) -> float:
        """Sum of inter-utterance gaps divided by total duration."""
        if duration_ms <= 0:
            return 0.0
        utterances = getattr(transcript, "utterances", None) or []
        if not utterances:
            return 0.0

        ordered = sorted(
            utterances, key=lambda u: int(getattr(u, "start", 0) or 0)
        )
        gap_total = 0
        previous_end: Optional[int] = None
        for utt in ordered:
            start = int(getattr(utt, "start", 0) or 0)
            end = int(getattr(utt, "end", 0) or 0)
            if previous_end is not None and start > previous_end:
                gap_total += start - previous_end
            if previous_end is None or end > previous_end:
                previous_end = end

        first_start = int(getattr(ordered[0], "start", 0) or 0)
        gap_total += max(0, first_start)

        last_end = int(previous_end or 0)
        if duration_ms > last_end:
            gap_total += duration_ms - last_end

        return min(1.0, max(0.0, gap_total / duration_ms))

    # ------------------------------------------------------------------ #
    #  Logging helper
    # ------------------------------------------------------------------ #
    @contextmanager
    def _stage(self, video_id: str, stage: str) -> Iterator[None]:
        start = time.time()
        logger.debug("[%s] stage=%s START", video_id, stage)
        try:
            yield
        except Exception:
            elapsed = time.time() - start
            exc = sys.exc_info()[1]
            logger.error(
                "[%s] stage=%s FAILED after %.2fs: %s",
                video_id,
                stage,
                elapsed,
                exc,
            )
            raise
        else:
            elapsed = time.time() - start
            logger.debug(
                "[%s] stage=%s END (%.2fs)", video_id, stage, elapsed
            )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<AudioAnalysisClient videos={self.buckets.videos!r} "
            f"processed={self.buckets.processed!r}>"
        )
