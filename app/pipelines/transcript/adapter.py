"""
Adapter: bridge between the transcript pipeline runner and WhisperX.

Uses WhisperX for:
- Better transcription accuracy (especially for Turkish)
- Forced word-level alignment
- Speaker diarization (teacher vs. students)

Falls back to plain Whisper if WhisperX is not available.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from app.pipelines.transcript.schema import (
    TranscriptData,
    TranscriptParams,
    TranscriptSegment,
    TranscriptSummary,
    WordTimestamp,
)

logger = logging.getLogger(__name__)


# ── Device detection ─────────────────────────────────────────

def _get_device() -> str:
    """Return 'cuda' if GPU available, else 'cpu'."""
    try:
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def _get_compute_type(device: str) -> str:
    """Return optimal compute type for the device."""
    return "float16" if device == "cuda" else "int8"


# ── WhisperX transcription + diarization ─────────────────────

def run_analysis(
    audio_path: str,
    model_size: str = "medium",
    language: str = "tr",
    diarize: bool = True,
    hf_token: Optional[str] = None,
) -> dict:
    """
    Transcribe audio using WhisperX with alignment and diarization.

    Parameters
    ----------
    audio_path : str
        Path to the WAV file.
    model_size : str
        Model size: 'tiny', 'base', 'small', 'medium', 'large-v3'.
    language : str
        Language code.
    diarize : bool
        Enable speaker diarization.
    hf_token : str, optional
        HuggingFace token for pyannote diarization.
        Falls back to HF_TOKEN env var.

    Returns
    -------
    dict
        Result with 'segments', 'language', and speaker labels.
    """
    device = _get_device()
    compute_type = _get_compute_type(device)

    try:
        import whisperx

        logger.info(
            "Loading WhisperX model '%s' on %s (%s)",
            model_size, device, compute_type,
        )
        model = whisperx.load_model(
            model_size,
            device=device,
            compute_type=compute_type,
            language=language,
        )

        # 1. Transcribe
        logger.info("Transcribing %s with WhisperX...", audio_path)
        audio = whisperx.load_audio(audio_path)
        result = model.transcribe(audio, batch_size=16)
        logger.info("Transcription done: %d segments", len(result.get("segments", [])))

        # 2. Align (word-level timestamps)
        try:
            logger.info("Aligning word timestamps...")
            model_a, metadata = whisperx.load_align_model(
                language_code=language, device=device
            )
            result = whisperx.align(
                result["segments"], model_a, metadata, audio, device,
                return_char_alignments=False,
            )
            logger.info("Alignment done")
        except Exception as exc:
            logger.warning("Alignment failed (continuing without): %s", exc)

        # 3. Diarize (speaker separation)
        if diarize:
            token = hf_token or os.environ.get("HF_TOKEN")
            if token:
                try:
                    logger.info("Running speaker diarization...")
                    diarize_model = whisperx.DiarizationPipeline(
                        use_auth_token=token, device=device
                    )
                    diarize_segments = diarize_model(audio)
                    result = whisperx.assign_word_speakers(diarize_segments, result)
                    logger.info("Diarization done")
                except Exception as exc:
                    logger.warning("Diarization failed (continuing without): %s", exc)
            else:
                logger.info(
                    "No HF_TOKEN set — skipping diarization. "
                    "Set HF_TOKEN env var for speaker separation."
                )

        result["language"] = language
        return result

    except ImportError:
        logger.warning("WhisperX not installed — falling back to plain Whisper")
        return _run_plain_whisper(audio_path, model_size, language)


def _run_plain_whisper(
    audio_path: str, model_size: str, language: str
) -> dict:
    """Fallback: use plain OpenAI Whisper if WhisperX is not available."""
    import whisper

    logger.info("Loading Whisper model '%s' (fallback)", model_size)
    model = whisper.load_model(model_size)

    result = model.transcribe(
        audio_path,
        language=language,
        word_timestamps=True,
        verbose=False,
    )
    return result


# ── Transform raw output → schema ────────────────────────────

def transform(
    raw: dict,
    params: TranscriptParams,
    include_word_timestamps: bool = True,
) -> TranscriptData:
    """
    Convert raw WhisperX/Whisper output into the ``TranscriptData`` schema.
    """
    raw_segments = raw.get("segments", [])
    detected_lang = raw.get("language", params.language)

    segments = []
    total_words = 0
    all_speakers = set()

    for seg in raw_segments:
        seg_text = seg.get("text", "").strip()
        seg_word_count = len(seg_text.split())
        total_words += seg_word_count

        speaker = seg.get("speaker")
        if speaker:
            all_speakers.add(speaker)

        # Word-level timestamps
        words = None
        if include_word_timestamps and seg.get("words"):
            words = []
            for w in seg["words"]:
                word_text = w.get("word", "").strip()
                if not word_text:
                    continue
                words.append(
                    WordTimestamp(
                        word=word_text,
                        start_sec=round(w.get("start", 0.0), 3),
                        end_sec=round(w.get("end", 0.0), 3),
                        confidence=round(w.get("score", 0.0), 3)
                        if w.get("score") is not None else None,
                        speaker=w.get("speaker"),
                    )
                )

        segments.append(
            TranscriptSegment(
                id=len(segments),
                start_sec=round(seg.get("start", 0.0), 3),
                end_sec=round(seg.get("end", 0.0), 3),
                text=seg_text,
                speaker=speaker,
                confidence=round(seg.get("avg_logprob", 0.0), 3)
                if seg.get("avg_logprob") is not None else None,
                words=words,
            )
        )

    # Summary
    total_duration = 0.0
    if segments:
        total_duration = segments[-1].end_sec - segments[0].start_sec

    avg_words = (total_words / len(segments)) if segments else 0.0
    speaker_list = sorted(all_speakers) if all_speakers else None

    summary = TranscriptSummary(
        total_duration_sec=round(total_duration, 2),
        total_words=total_words,
        total_segments=len(segments),
        language_detected=detected_lang,
        language_confidence=None,
        avg_words_per_segment=round(avg_words, 1),
        num_speakers=len(all_speakers) if all_speakers else None,
        speakers=speaker_list,
    )

    return TranscriptData(
        analysis_params=params,
        summary=summary,
        segments=segments,
    )


def get_whisper_segments_for_sound(raw: dict) -> list[dict]:
    """
    Extract minimal segment data from WhisperX results for the sound pipeline.
    """
    return [
        {
            "start": seg.get("start", 0.0),
            "end": seg.get("end", 0.0),
            "text": seg.get("text", ""),
        }
        for seg in raw.get("segments", [])
    ]
