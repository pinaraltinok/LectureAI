"""
Segment Worker — auto-discovers and processes all segments from GCS.

Scans the ``lectureai_processed`` bucket, runs all three pipelines
(transcript → sound → visual) on each segment, and saves results.

Usage on Colab::

    # Cell 1: Setup
    !git clone https://github.com/pinaraltinok/LectureAI.git
    %cd LectureAI
    !pip install librosa opensmile praat-parselmouth openai-whisper pydantic google-cloud-storage -q
    from google.colab import auth
    auth.authenticate_user()

    # Cell 2: Run
    from app.workers.segment_worker import process_all_segments
    process_all_segments()
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Optional

from google.cloud import storage

from app.pipelines.common.audio_extractor import extract_audio
from app.pipelines.common.gcs import cleanup, download_segment
from app.pipelines.sound.adapter import run_analysis as run_sound_analysis
from app.pipelines.sound.adapter import transform as transform_sound
from app.pipelines.sound.schema import SoundAnalysisParams
from app.pipelines.transcript.adapter import (
    get_whisper_segments_for_sound,
    run_analysis as run_whisper,
    transform as transform_transcript,
)
from app.pipelines.transcript.schema import TranscriptParams

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("segment-worker")

# ── Configuration ────────────────────────────────────────────

PROCESSED_BUCKET = os.environ.get("PROCESSED_BUCKET", "lectureai_processed")
SEGMENT_PATTERN = re.compile(r"seg_\d+\.mp4$", re.IGNORECASE)


# ── Discovery ────────────────────────────────────────────────

def discover_segments(bucket_name: str = PROCESSED_BUCKET) -> dict[str, list[str]]:
    """
    Scan the bucket and return segments grouped by lecture.

    Returns
    -------
    dict
        ``{ "lecture_name": ["gs://bucket/lecture/seg_0.mp4", ...], ... }``
    """
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blobs = bucket.list_blobs()

    lectures: dict[str, list[str]] = {}

    for blob in blobs:
        if not SEGMENT_PATTERN.search(blob.name):
            continue

        parts = blob.name.split("/")
        if len(parts) >= 2:
            lecture_name = parts[0]
        else:
            lecture_name = "_root"

        gcs_uri = f"gs://{bucket_name}/{blob.name}"
        lectures.setdefault(lecture_name, []).append(gcs_uri)

    # Sort segments within each lecture
    for name in lectures:
        lectures[name] = sorted(lectures[name])

    return lectures


# ── Single segment processor ────────────────────────────────

def process_segment(
    gcs_uri: str,
    segment_index: int,
    lecture_name: str,
    teacher_name: str = "Unknown",
    whisper_model: str = "base",
    language: str = "tr",
    run_visual: bool = False,
    persist: bool = False,
    supabase_client=None,
) -> dict:
    """
    Process a single segment through transcript + sound pipelines.

    Returns a dict with the segment's results.
    """
    segment_id = f"{lecture_name}_seg_{segment_index}"
    local_video: Optional[str] = None
    audio_16k: Optional[str] = None
    audio_22k: Optional[str] = None

    try:
        logger.info("=" * 60)
        logger.info("[%s] Processing: %s", segment_id, gcs_uri)

        # ── 1. Download ──────────────────────────────────────
        local_video = download_segment(gcs_uri, prefix="lectureai_worker_")

        # ── 2. Extract audio (both sample rates) ─────────────
        audio_16k = extract_audio(local_video, sample_rate=16000, mono=True)
        audio_22k = extract_audio(local_video, sample_rate=22050, mono=True)

        # ── 3. Transcript (Whisper) ──────────────────────────
        logger.info("[%s] Running Whisper transcription...", segment_id)
        whisper_raw = run_whisper(
            audio_path=audio_16k,
            model_size=whisper_model,
            language=language,
        )
        whisper_segments = get_whisper_segments_for_sound(whisper_raw)
        transcript = transform_transcript(
            raw=whisper_raw,
            params=TranscriptParams(model_size=whisper_model, language=language),
        )
        logger.info(
            "[%s] Transcript: %d words, %d segments",
            segment_id, transcript.summary.total_words, transcript.summary.total_segments,
        )

        # ── 4. Sound analysis (with Whisper timestamps) ─────
        logger.info("[%s] Running sound analysis...", segment_id)
        sound_raw = run_sound_analysis(
            audio_path=audio_22k,
            whisper_segments=whisper_segments,
            sample_rate=22050,
        )
        sound_metrics = transform_sound(
            raw=sound_raw,
            params=SoundAnalysisParams(),
        )
        logger.info(
            "[%s] Sound: clarity=%.3f, child_friendly=%.3f, emotion=%s",
            segment_id,
            sound_metrics.summary.clarity_score,
            sound_metrics.summary.child_friendly_score,
            sound_metrics.summary.emotional_tone,
        )

        # ── 5. Visual (optional — heavy, requires ML models) ─
        visual_metrics = None
        if run_visual:
            try:
                from app.pipelines.visual.runner import run_visual_pipeline
                visual_metrics = run_visual_pipeline(
                    segment_id=segment_id,
                    gcs_uri=gcs_uri,
                    teacher_name=teacher_name,
                    persist=False,
                )
                logger.info("[%s] Visual: complete", segment_id)
            except Exception as exc:
                logger.warning("[%s] Visual pipeline skipped: %s", segment_id, exc)

        # ── 6. Persist to Supabase (if enabled) ─────────────
        if persist and supabase_client:
            payload = {
                "segment_id": segment_id,
                "lecture_id": lecture_name,
                "gcs_uri": gcs_uri,
                "teacher_name": teacher_name,
                "sound_metrics": sound_metrics.model_dump(),
                "transcript": transcript.model_dump(),
                "status": "partial" if not visual_metrics else "complete",
            }
            if visual_metrics:
                payload["visual_metrics"] = visual_metrics.model_dump()

            supabase_client.table("segment_results").upsert(payload).execute()
            logger.info("[%s] Persisted to Supabase", segment_id)

        result = {
            "segment_id": segment_id,
            "gcs_uri": gcs_uri,
            "status": "success",
            "transcript_words": transcript.summary.total_words,
            "transcript_segments": transcript.summary.total_segments,
            "clarity_score": sound_metrics.summary.clarity_score,
            "child_friendly_score": sound_metrics.summary.child_friendly_score,
            "emotional_tone": sound_metrics.summary.emotional_tone,
            "pitch_variation": sound_metrics.summary.pitch_variation_coeff,
            "speech_rate": sound_metrics.summary.speech_rate_syl_per_sec,
        }

        logger.info("[%s] ✅ Complete", segment_id)
        return result

    except Exception as exc:
        logger.error("[%s] ❌ Failed: %s", segment_id, exc, exc_info=True)
        return {
            "segment_id": segment_id,
            "gcs_uri": gcs_uri,
            "status": "failed",
            "error": str(exc),
        }

    finally:
        files = [f for f in [audio_16k, audio_22k, local_video] if f is not None]
        if files:
            cleanup(*files)


# ── Batch processor ──────────────────────────────────────────

def process_all_segments(
    bucket_name: str = PROCESSED_BUCKET,
    teacher_name: str = "Unknown",
    whisper_model: str = "base",
    language: str = "tr",
    run_visual: bool = False,
    persist: bool = False,
    max_segments: Optional[int] = None,
) -> list[dict]:
    """
    Auto-discover and process ALL segments in the bucket.

    Parameters
    ----------
    bucket_name : str
        GCS bucket containing processed segments.
    teacher_name : str
        Teacher name for visual pipeline (OCR matching).
    whisper_model : str
        Whisper model size: tiny, base, small, medium, large.
    language : str
        Language code for transcription.
    run_visual : bool
        Also run the visual pipeline (requires cv2, mediapipe, etc.).
    persist : bool
        Save results to Supabase.
    max_segments : int, optional
        Limit total segments processed (useful for testing).

    Returns
    -------
    list of dict
        Results for each processed segment.
    """
    logger.info("🔍 Discovering segments in gs://%s ...", bucket_name)
    lectures = discover_segments(bucket_name)

    total_segments = sum(len(segs) for segs in lectures.values())
    logger.info(
        "📦 Found %d lectures, %d total segments",
        len(lectures), total_segments,
    )

    for name, segs in lectures.items():
        logger.info("  📁 %s: %d segments", name, len(segs))

    # Supabase client (if persisting)
    supabase_client = None
    if persist:
        try:
            from supabase import create_client
            url = os.environ.get("SUPABASE_URL")
            key = os.environ.get("SUPABASE_KEY")
            if url and key:
                supabase_client = create_client(url, key)
                logger.info("✅ Supabase client connected")
            else:
                logger.warning("⚠️ SUPABASE_URL/KEY not set — results won't be saved")
                persist = False
        except ImportError:
            logger.warning("⚠️ supabase-py not installed — results won't be saved")
            persist = False

    all_results = []
    processed = 0
    start_time = time.time()

    for lecture_name, segment_uris in sorted(lectures.items()):
        logger.info("\n{'='*60}")
        logger.info("📂 Processing lecture: %s (%d segments)", lecture_name, len(segment_uris))

        for idx, gcs_uri in enumerate(segment_uris):
            if max_segments and processed >= max_segments:
                logger.info("🛑 Reached max_segments=%d — stopping", max_segments)
                break

            result = process_segment(
                gcs_uri=gcs_uri,
                segment_index=idx,
                lecture_name=lecture_name,
                teacher_name=teacher_name,
                whisper_model=whisper_model,
                language=language,
                run_visual=run_visual,
                persist=persist,
                supabase_client=supabase_client,
            )
            all_results.append(result)
            processed += 1

        if max_segments and processed >= max_segments:
            break

    # ── Summary ──────────────────────────────────────────────
    elapsed = time.time() - start_time
    success = sum(1 for r in all_results if r["status"] == "success")
    failed = sum(1 for r in all_results if r["status"] == "failed")

    logger.info("\n" + "=" * 60)
    logger.info("🏁 PROCESSING COMPLETE")
    logger.info("  Total segments: %d", processed)
    logger.info("  ✅ Success: %d", success)
    logger.info("  ❌ Failed:  %d", failed)
    logger.info("  ⏱️  Elapsed: %.1f min", elapsed / 60)

    if success > 0:
        avg_clarity = sum(
            r.get("clarity_score", 0) for r in all_results if r["status"] == "success"
        ) / success
        avg_child = sum(
            r.get("child_friendly_score", 0) for r in all_results if r["status"] == "success"
        ) / success
        logger.info("  📊 Avg clarity: %.3f", avg_clarity)
        logger.info("  📊 Avg child-friendly: %.3f", avg_child)

    return all_results
