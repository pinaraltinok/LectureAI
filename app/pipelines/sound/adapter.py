"""
Adapter: bridge between the sound pipeline runner and the
audio analysis libraries (librosa, openSMILE, Praat, Whisper timestamps).

This module handles:
- Audio extraction (via shared utility)
- Acoustic analysis with librosa, openSMILE, parselmouth
- Pause/speech-rate derivation from Whisper timestamps
- Transformation to the SoundMetrics schema
"""

from __future__ import annotations

import logging
import math
import os
from typing import Optional

import librosa
import numpy as np
import opensmile
import parselmouth
from parselmouth.praat import call as praat_call

from app.pipelines.common.audio_extractor import extract_audio
from app.pipelines.common.gcs import cleanup, download_segment
from app.pipelines.sound.schema import (
    SoundAnalysisParams,
    SoundMetrics,
    SoundSummary,
    SoundWindowDetail,
)

logger = logging.getLogger(__name__)


# ── Librosa analysis ─────────────────────────────────────────

def _analyze_pitch_energy(
    y: np.ndarray, sr: int
) -> dict:
    """Extract pitch (pyin) and energy (rms) from audio signal."""
    # Pitch via pyin
    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"), sr=sr
    )
    f0_voiced = f0[voiced_flag] if voiced_flag is not None else f0[~np.isnan(f0)]
    f0_voiced = f0_voiced[~np.isnan(f0_voiced)]

    pitch_mean = float(np.mean(f0_voiced)) if len(f0_voiced) > 0 else 0.0
    pitch_std = float(np.std(f0_voiced)) if len(f0_voiced) > 0 else 0.0
    pitch_var_coeff = (pitch_std / pitch_mean) if pitch_mean > 0 else 0.0

    # Energy via RMS
    rms = librosa.feature.rms(y=y)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    energy_mean_db = float(np.mean(rms_db))
    energy_std_db = float(np.std(rms_db))

    return {
        "pitch_mean_hz": round(pitch_mean, 2),
        "pitch_std_hz": round(pitch_std, 2),
        "pitch_variation_coeff": round(pitch_var_coeff, 4),
        "energy_mean_db": round(energy_mean_db, 2),
        "energy_std_db": round(energy_std_db, 2),
    }


# ── openSMILE analysis ──────────────────────────────────────

def _analyze_emotion(audio_path: str) -> dict:
    """
    Extract eGeMAPSv02 features via openSMILE and derive
    arousal/valence-based emotional tone.
    """
    smile = opensmile.Smile(
        feature_set=opensmile.FeatureSet.eGeMAPSv02,
        feature_level=opensmile.FeatureLevel.Functionals,
    )
    features = smile.process_file(audio_path)

    # Extract key features for emotion mapping
    # eGeMAPSv02 functionals include F0, loudness, spectral features
    f0_mean = float(features["F0semitoneFrom27.5Hz_sma3nz_amean"].iloc[0])
    f0_std = float(features["F0semitoneFrom27.5Hz_sma3nz_stddevNorm"].iloc[0])
    loudness_mean = float(features["loudness_sma3_amean"].iloc[0])
    loudness_std = float(features["loudness_sma3_stddevNorm"].iloc[0])
    spectral_flux = float(features["spectralFlux_sma3_amean"].iloc[0])

    # Arousal approximation (high energy + high pitch variation + spectral flux)
    arousal = min(1.0, (f0_std * 0.3 + loudness_std * 0.4 + spectral_flux * 0.3))

    # Valence approximation (higher pitch + moderate loudness = more positive)
    valence = min(1.0, max(0.0, (f0_mean / 20.0) * 0.5 + (1.0 - abs(loudness_mean - 0.5)) * 0.5))

    # Map to categorical tone
    if arousal > 0.6 and valence > 0.5:
        tone = "positive"
    elif arousal > 0.6 and valence <= 0.5:
        tone = "negative"
    elif arousal <= 0.6 and valence > 0.5:
        tone = "neutral-positive"
    else:
        tone = "neutral"

    confidence = min(1.0, max(0.0, abs(arousal - 0.5) + abs(valence - 0.5)))

    return {
        "emotional_tone": tone,
        "emotional_confidence": round(confidence, 3),
    }


# ── Praat voice quality ─────────────────────────────────────

def _analyze_clarity(audio_path: str) -> dict:
    """
    Compute voice clarity score from Praat (HNR, jitter, shimmer).
    """
    sound = parselmouth.Sound(audio_path)
    pitch = praat_call(sound, "To Pitch", 0.0, 75.0, 600.0)
    point_process = praat_call(
        sound, "To PointProcess (periodic, cc)", 75.0, 600.0
    )

    # HNR (harmonics-to-noise ratio) — higher = clearer
    harmonicity = praat_call(sound, "To Harmonicity (cc)", 0.01, 75.0, 0.1, 1.0)
    hnr = praat_call(harmonicity, "Get mean", 0, 0)
    hnr = hnr if not math.isnan(hnr) else 0.0

    # Jitter — lower = steadier pitch
    jitter = praat_call(
        point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3
    )
    jitter = jitter if not math.isnan(jitter) else 0.05

    # Shimmer — lower = steadier amplitude
    shimmer = praat_call(
        [sound, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6
    )
    shimmer = shimmer if not math.isnan(shimmer) else 0.1

    # Composite clarity score (0–1, higher = clearer)
    # HNR: typical range 0–30 dB, normalize to 0–1
    hnr_norm = min(1.0, max(0.0, hnr / 30.0))
    # Jitter: typical < 0.01 is good, > 0.02 is poor
    jitter_norm = min(1.0, max(0.0, 1.0 - (jitter / 0.03)))
    # Shimmer: typical < 0.03 is good, > 0.1 is poor
    shimmer_norm = min(1.0, max(0.0, 1.0 - (shimmer / 0.15)))

    clarity = 0.4 * hnr_norm + 0.3 * jitter_norm + 0.3 * shimmer_norm

    return {
        "hnr_db": round(hnr, 2),
        "jitter": round(jitter, 5),
        "shimmer": round(shimmer, 5),
        "clarity_score": round(clarity, 3),
    }


# ── Whisper-based speech rate & pauses ───────────────────────

def _analyze_speech_rate_and_pauses(
    whisper_segments: list[dict] | None,
    total_duration_sec: float,
) -> dict:
    """
    Derive speech rate and pause metrics from Whisper segment timestamps.

    Parameters
    ----------
    whisper_segments : list of dict, optional
        Whisper segments with 'start', 'end', 'text' keys.
        If None, returns zero-valued defaults.
    total_duration_sec : float
        Total audio duration.
    """
    if not whisper_segments or total_duration_sec <= 0:
        return {
            "speech_rate_syl_per_sec": 0.0,
            "pause_ratio": 1.0,
            "pause_count": 0,
            "mean_pause_duration_sec": 0.0,
        }

    # Count words across all segments
    total_words = sum(
        len(seg.get("text", "").split()) for seg in whisper_segments
    )

    # Voiced duration = sum of segment durations
    voiced_duration = sum(
        seg["end"] - seg["start"]
        for seg in whisper_segments
        if seg.get("end", 0) > seg.get("start", 0)
    )

    # Speech rate: words per second of voiced time
    speech_rate = (total_words / voiced_duration) if voiced_duration > 0 else 0.0

    # Pauses: gaps between consecutive segments
    sorted_segs = sorted(whisper_segments, key=lambda s: s.get("start", 0))
    pauses = []
    for i in range(1, len(sorted_segs)):
        gap = sorted_segs[i]["start"] - sorted_segs[i - 1]["end"]
        if gap > 0.3:  # only count gaps > 300ms as pauses
            pauses.append(gap)

    # Also count leading silence and trailing silence
    if sorted_segs[0]["start"] > 0.5:
        pauses.insert(0, sorted_segs[0]["start"])
    if total_duration_sec - sorted_segs[-1]["end"] > 0.5:
        pauses.append(total_duration_sec - sorted_segs[-1]["end"])

    total_pause = sum(pauses)
    pause_ratio = total_pause / total_duration_sec if total_duration_sec > 0 else 0.0
    mean_pause = (total_pause / len(pauses)) if pauses else 0.0

    return {
        "speech_rate_syl_per_sec": round(speech_rate, 2),
        "pause_ratio": round(pause_ratio, 3),
        "pause_count": len(pauses),
        "mean_pause_duration_sec": round(mean_pause, 3),
    }


# ── Child-friendly score ─────────────────────────────────────

def _compute_child_friendly_score(
    pitch_variation_coeff: float,
    speech_rate: float,
    clarity_score: float,
    pause_ratio: float,
) -> float:
    """
    Weighted composite score (0–1) indicating how child-friendly
    the speaker's delivery is.
    """
    # Pitch variation: higher is better (more expressive), cap at 0.5
    pitch_norm = min(1.0, pitch_variation_coeff / 0.5)

    # Speech rate: 2–4 syl/sec is ideal, penalize extremes
    if speech_rate <= 0:
        rate_norm = 0.0
    elif speech_rate < 2.0:
        rate_norm = speech_rate / 2.0
    elif speech_rate <= 4.0:
        rate_norm = 1.0
    else:
        rate_norm = max(0.0, 1.0 - (speech_rate - 4.0) / 4.0)

    # Pause quality: 0.08–0.20 is ideal
    if pause_ratio < 0.05:
        pause_norm = pause_ratio / 0.05
    elif pause_ratio <= 0.20:
        pause_norm = 1.0
    else:
        pause_norm = max(0.0, 1.0 - (pause_ratio - 0.20) / 0.30)

    score = (
        0.25 * pitch_norm
        + 0.25 * rate_norm
        + 0.25 * clarity_score
        + 0.25 * pause_norm
    )
    return round(min(1.0, max(0.0, score)), 3)


# ── Public API ───────────────────────────────────────────────

def run_analysis(
    audio_path: str,
    whisper_segments: list[dict] | None = None,
    sample_rate: int = 22050,
) -> dict:
    """
    Run the full sound analysis stack on an audio file.

    Parameters
    ----------
    audio_path : str
        Path to the WAV file.
    whisper_segments : list of dict, optional
        Whisper segments for speech rate / pause analysis.
        If not provided, those metrics will be zero-valued.
    sample_rate : int
        Sample rate to load with librosa.

    Returns
    -------
    dict
        Raw metrics dictionary ready for ``transform()``.
    """
    logger.info("Running sound analysis on %s", audio_path)

    # Load audio
    y, sr = librosa.load(audio_path, sr=sample_rate)
    duration = float(len(y) / sr)

    # Run all analysis modules
    pitch_energy = _analyze_pitch_energy(y, sr)
    emotion = _analyze_emotion(audio_path)
    clarity = _analyze_clarity(audio_path)
    speech_pauses = _analyze_speech_rate_and_pauses(whisper_segments, duration)

    child_friendly = _compute_child_friendly_score(
        pitch_variation_coeff=pitch_energy["pitch_variation_coeff"],
        speech_rate=speech_pauses["speech_rate_syl_per_sec"],
        clarity_score=clarity["clarity_score"],
        pause_ratio=speech_pauses["pause_ratio"],
    )

    raw = {
        "duration_analyzed_sec": round(duration, 2),
        **pitch_energy,
        **speech_pauses,
        **emotion,
        **clarity,
        "child_friendly_score": child_friendly,
    }

    logger.info(
        "Sound analysis complete: duration=%.1fs clarity=%.3f child_friendly=%.3f",
        duration, clarity["clarity_score"], child_friendly,
    )
    return raw


def transform(
    raw: dict,
    params: SoundAnalysisParams,
    include_window_details: bool = True,
) -> SoundMetrics:
    """
    Convert raw analysis dict into the canonical ``SoundMetrics`` schema.
    """
    summary = SoundSummary(
        duration_analyzed_sec=raw["duration_analyzed_sec"],
        pitch_mean_hz=raw["pitch_mean_hz"],
        pitch_std_hz=raw["pitch_std_hz"],
        pitch_variation_coeff=raw["pitch_variation_coeff"],
        energy_mean_db=raw["energy_mean_db"],
        energy_std_db=raw["energy_std_db"],
        speech_rate_syl_per_sec=raw["speech_rate_syl_per_sec"],
        pause_ratio=raw["pause_ratio"],
        pause_count=raw["pause_count"],
        mean_pause_duration_sec=raw["mean_pause_duration_sec"],
        emotional_tone=raw["emotional_tone"],
        emotional_confidence=raw["emotional_confidence"],
        clarity_score=raw["clarity_score"],
        child_friendly_score=raw["child_friendly_score"],
    )

    # Window details would be computed in a future iteration
    # by sliding over the audio in window_sec / hop_sec chunks
    window_details = None

    return SoundMetrics(
        analysis_params=params,
        summary=summary,
        window_details=window_details,
    )
