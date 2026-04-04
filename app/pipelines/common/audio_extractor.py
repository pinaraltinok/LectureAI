"""
Shared audio extraction from video files using FFmpeg.

Used by both sound and transcript adapters to avoid extracting
audio twice from the same video segment.
"""

from __future__ import annotations

import logging
import os
import subprocess

logger = logging.getLogger(__name__)

FFMPEG_BIN = os.environ.get("FFMPEG_BIN", "ffmpeg")


def extract_audio(
    video_path: str,
    output_path: str | None = None,
    sample_rate: int = 22050,
    mono: bool = True,
) -> str:
    """
    Extract the audio track from a video file as a WAV.

    Parameters
    ----------
    video_path : str
        Path to the input video file (.mp4).
    output_path : str, optional
        Path for the output WAV.  If None, places it alongside the video
        with a ``.wav`` extension.
    sample_rate : int
        Target sample rate in Hz.  Default 22050 (librosa standard).
        Use 16000 for Whisper.
    mono : bool
        If True, downmix to single channel.

    Returns
    -------
    str
        Absolute path to the extracted WAV file.

    Raises
    ------
    RuntimeError
        If FFmpeg exits with a non-zero code.
    """
    if output_path is None:
        base, _ = os.path.splitext(video_path)
        output_path = f"{base}_{sample_rate}hz.wav"

    cmd = [
        FFMPEG_BIN,
        "-y",                   # overwrite without asking
        "-i", video_path,
        "-vn",                  # drop video stream
        "-ar", str(sample_rate),
    ]

    if mono:
        cmd.extend(["-ac", "1"])

    cmd.extend([
        "-acodec", "pcm_s16le",  # 16-bit PCM WAV
        output_path,
    ])

    logger.info("Extracting audio: %s → %s (sr=%d)", video_path, output_path, sample_rate)

    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as exc:
        logger.error(
            "FFmpeg audio extraction failed (exit %d): %s",
            exc.returncode, exc.stderr,
        )
        raise RuntimeError(
            f"Audio extraction failed for {video_path}: {exc.stderr}"
        ) from exc

    size_mib = os.path.getsize(output_path) / (1024 * 1024)
    logger.info("Audio extracted: %s (%.1f MiB)", output_path, size_mib)
    return output_path
