"""AssemblyAI-backed audio analysis client.

Flow:

    1. If cached JSON exists at ``gs://{processed}/data/audio/{video_id}.json``,
       return it.
    2. Download the source MP4 from GCS to a tempfile.
    3. Convert to MP3 with ffmpeg (audio only, 64 kbps).
    4. Submit the MP3 file path to AssemblyAI (local upload, not URL).
    5. Poll until completed/error.
    6. Parse into ``AudioAnalysisResult`` (including ``SentimentSummary``).
    7. Upload JSON + human-readable ``.txt`` transcript to the processed bucket.
    8. Delete tempfiles.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator, List, Optional

import assemblyai as aai
import ffmpeg
from google.cloud import storage

from src.config import BucketConfig

from .schemas import (
    AudioAnalysisResult,
    TranscriptSegment,
    build_sentiment_summary,
)
from .transcript_format import build_transcript_txt

logger = logging.getLogger(__name__)


def resolve_ffmpeg_executable() -> Optional[str]:
    """Return a usable ``ffmpeg`` binary path, or ``None`` if not found.

    ``ffmpeg-python`` shells out to the real CLI. Set ``FFMPEG_BINARY`` or
    ``FFMPEG_PATH`` to a full path (e.g. ``C:\\\\ffmpeg\\\\bin\\\\ffmpeg.exe``)
    if ``ffmpeg`` is not on ``PATH`` (common on Windows).
    """
    for key in ("FFMPEG_BINARY", "FFMPEG_PATH"):
        raw = (os.environ.get(key) or "").strip().strip('"')
        if not raw:
            continue
        if os.path.isfile(raw):
            return os.path.normpath(raw)
        found = shutil.which(raw)
        if found:
            return found
    found = shutil.which("ffmpeg")
    if found:
        return found
    if sys.platform == "win32":
        return shutil.which("ffmpeg.exe")
    return None


def _ffmpeg_not_found_message() -> str:
    if sys.platform == "win32":
        install = (
            "Install ffmpeg (e.g. `winget install Gyan.FFmpeg` or "
            "https://www.gyan.dev/ffmpeg/builds/) and add its `bin` folder "
            "to your PATH, or set env var FFMPEG_BINARY to the full path "
            "of ffmpeg.exe."
        )
    else:
        install = (
            "Install ffmpeg with your package manager and ensure `ffmpeg` "
            "is on PATH, or set FFMPEG_BINARY to the full path of the binary."
        )
    return (
        "ffmpeg executable not found. The audio pipeline requires the "
        f"ffmpeg CLI (ffmpeg-python only wraps it). {install}"
    )


# --------------------------------------------------------------------------- #
#  Custom exception
# --------------------------------------------------------------------------- #
class AudioProcessingError(Exception):
    """Raised when any stage of the audio pipeline fails."""

    VALID_STAGES = {
        "download",
        "download_mp4",
        "ffmpeg",
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
    def _build_transcription_config(
        *,
        sentiment_analysis: bool = True,
        auto_highlights: bool = True,
    ) -> aai.TranscriptionConfig:
        """Build an AssemblyAI config compatible with old/new SDKs.

        ``speaker_labels`` enables diarization: each utterance gets a label
        (typically **A**, **B**, …). That is *who spoke when*, not a personal
        name. To show "Eğitmen" / a real name, map labels in the UI or from
        your own roster; the API does not resolve identities.
        """
        base_kwargs = {
            "speaker_labels": True,
            "sentiment_analysis": sentiment_analysis,
            "auto_highlights": auto_highlights,
            # Force Turkish transcription to avoid mixed/English output.
            "language_code": "tr",
        }
        try:
            return aai.TranscriptionConfig(
                **base_kwargs,
                speech_models=["universal-2"],
            )
        except TypeError:
            # Older SDKs may use enum values and reject plain strings.
            try:
                language_code = getattr(getattr(aai, "LanguageCode", None), "tr")
                if language_code is not None:
                    base_kwargs["language_code"] = language_code
            except Exception:
                pass
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
        mp3_path: Optional[str] = None
        try:
            mp4_path = await self._download_mp4_to_tempfile(video_id)
            mp3_path = await self._convert_mp4_to_mp3(video_id, mp4_path)

            transcript_id = await self._submit_transcription(video_id, mp3_path)

            transcript = await self._wait_for_transcription(
                video_id, transcript_id
            )

            result = self._build_result(video_id, transcript)

            await self._save_result(video_id, result)
        finally:
            for path in (mp4_path, mp3_path):
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
                from src.cv_video_id import normalize_cv_video_id

                normalized_id = normalize_cv_video_id(video_id)
                candidate_ids = [video_id]
                if normalized_id and normalized_id not in candidate_ids:
                    candidate_ids.insert(0, normalized_id)

                template = self.buckets.video_key
                if "{video_id}" in template:
                    prefix, suffix = template.split("{video_id}", 1)
                else:
                    # Defensive fallback; should never happen with current config.
                    prefix, suffix = "Lesson_Records/", ".mp4"

                suffixes = [suffix]
                # Match CV downloader behavior: try no extension and both mp4 cases.
                for sfx in ("", ".mp4", ".MP4"):
                    if sfx not in suffixes:
                        suffixes.append(sfx)

                tried: list[str] = []
                resolved_blob = None
                for candidate_id in candidate_ids:
                    # Avoid doubling extension when candidate_id already contains one.
                    base_id = candidate_id
                    for ext in (".mp4", ".MP4"):
                        if base_id.endswith(ext):
                            base_id = base_id[: -len(ext)]
                            break
                    for sfx in suffixes:
                        blob_name = f"{prefix}{base_id}{sfx}"
                        tried.append(f"gs://{self.buckets.videos}/{blob_name}")
                        blob = bucket.blob(blob_name)
                        exists = await asyncio.to_thread(blob.exists)
                        if exists:
                            resolved_blob = blob
                            logger.info(
                                "[%s] resolved source blob for audio: %s",
                                video_id,
                                blob_name,
                            )
                            break
                    if resolved_blob is not None:
                        break

                if resolved_blob is None:
                    raise FileNotFoundError(
                        "Source video not found (tried): " + ", ".join(tried[:12])
                    )

                await asyncio.to_thread(resolved_blob.download_to_filename, mp4_path)
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

    async def _convert_mp4_to_mp3(self, video_id: str, mp4_path: str) -> str:
        with self._stage(video_id, "ffmpeg"):
            ffmpeg_cmd = resolve_ffmpeg_executable()
            if not ffmpeg_cmd:
                raise AudioProcessingError(
                    video_id,
                    "ffmpeg",
                    _ffmpeg_not_found_message(),
                )
            logger.debug("[%s] using ffmpeg binary: %s", video_id, ffmpeg_cmd)

            fd, mp3_path = tempfile.mkstemp(suffix=".mp3")
            os.close(fd)

            def _run_ffmpeg() -> None:
                (
                    ffmpeg.input(mp4_path)
                    .output(
                        mp3_path,
                        vn=None,
                        acodec="libmp3lame",
                        audio_bitrate="64k",
                    )
                    .run(
                        overwrite_output=True,
                        quiet=True,
                        cmd=ffmpeg_cmd,
                    )
                )

            try:
                await asyncio.to_thread(_run_ffmpeg)
            except Exception as exc:
                try:
                    os.unlink(mp3_path)
                except OSError:
                    pass
                hint = ""
                err_s = str(exc)
                if (
                    "WinError 2" in err_s
                    or "[Errno 2]" in err_s
                    or "cannot find the file specified" in err_s.lower()
                ):
                    hint = (
                        " (Likely cause: ffmpeg.exe missing or not on PATH; "
                        "set FFMPEG_BINARY or install ffmpeg — see logs above.)"
                    )
                raise AudioProcessingError(
                    video_id,
                    "ffmpeg",
                    f"ffmpeg MP3 conversion failed: {exc}{hint}",
                ) from exc
            return mp3_path

    async def _submit_transcription(
        self,
        video_id: str,
        mp3_path: str,
    ) -> str:
        """Submit a local MP3 file to AssemblyAI."""
        with self._stage(video_id, "upload_assemblyai"):
            try:
                config = self._build_transcription_config()
                transcriber = aai.Transcriber(config=config)
                try:
                    transcript = await asyncio.to_thread(
                        transcriber.submit, mp3_path
                    )
                except Exception as exc:
                    # AssemblyAI currently rejects some addons for Turkish.
                    msg = str(exc).lower()
                    unsupported = (
                        "not available in this language" in msg
                        and ("sentiment_analysis" in msg or "auto_highlights" in msg)
                    )
                    if not unsupported:
                        raise
                    logger.warning(
                        "[%s] Turkish model rejected sentiment/highlights; retrying without them",
                        video_id,
                    )
                    fallback_config = self._build_transcription_config(
                        sentiment_analysis=False,
                        auto_highlights=False,
                    )
                    fallback_transcriber = aai.Transcriber(config=fallback_config)
                    transcript = await asyncio.to_thread(
                        fallback_transcriber.submit, mp3_path
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
