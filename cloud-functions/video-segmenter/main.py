"""
LectureAI — Video Segmenter Cloud Function (2nd Gen)

Trigger : GCS object.finalized on `lectureai_full_videos`
Action  : Download → FFmpeg segment (600 s) → upload to `lectureai_processed`
Runtime : Python 3.11, 4 GiB RAM, 32 GiB disk, 540 s timeout
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import functions_framework
from cloudevents.http import CloudEvent
from google.cloud import storage

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────
SEGMENT_DURATION_SEC = 600  # 10 minutes
PROCESSED_BUCKET = os.environ.get("PROCESSED_BUCKET", "lectureai_processed")
EXPECTED_PREFIX = os.environ.get("EXPECTED_PREFIX", "Lesson_Records/")
FFMPEG_BIN = os.environ.get("FFMPEG_BIN", "ffmpeg")
FFPROBE_BIN = os.environ.get("FFPROBE_BIN", "ffprobe")

# Structured logging
logging.basicConfig(
    level=logging.INFO,
    format='{"severity":"%(levelname)s","message":"%(message)s","logger":"%(name)s"}',
)
logger = logging.getLogger("video-segmenter")

# Reuse across warm starts
_storage_client: storage.Client | None = None


def _get_storage_client() -> storage.Client:
    """Lazy-initialised singleton for the Storage client."""
    global _storage_client
    if _storage_client is None:
        _storage_client = storage.Client()
    return _storage_client


# ──────────────────────────────────────────────
# Idempotency Guard
# ──────────────────────────────────────────────
def _segments_already_exist(prefix: str) -> bool:
    """Return True if at least one segment blob already exists under *prefix*."""
    client = _get_storage_client()
    bucket = client.bucket(PROCESSED_BUCKET)
    blobs = list(bucket.list_blobs(prefix=prefix, max_results=1))
    return len(blobs) > 0


# ──────────────────────────────────────────────
# FFmpeg helpers
# ──────────────────────────────────────────────
def _probe_duration(video_path: str) -> float:
    """Return the duration of *video_path* in seconds via ffprobe."""
    cmd = [
        FFPROBE_BIN,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    duration = float(result.stdout.strip())
    logger.info("Probed duration: %.2f s for %s", duration, video_path)
    return duration


def _segment_video(video_path: str, output_dir: str, duration: float) -> list[dict]:
    """
    Split *video_path* into ≤ SEGMENT_DURATION_SEC chunks.

    Uses stream-copy (`-c copy`) for speed — no re-encoding.
    Returns a list of dicts: {local_path, index, start_time_sec, end_time_sec}.
    """
    segments: list[dict] = []
    index = 0
    start = 0.0

    while start < duration:
        end = min(start + SEGMENT_DURATION_SEC, duration)
        seg_filename = f"seg_{index}.mp4"
        seg_path = os.path.join(output_dir, seg_filename)

        cmd = [
            FFMPEG_BIN,
            "-y",                       # overwrite without asking
            "-ss", str(start),          # seek to start (input-level for speed)
            "-i", video_path,
            "-t", str(SEGMENT_DURATION_SEC),
            "-c", "copy",               # stream-copy, no re-encode
            "-movflags", "+faststart",  # streaming-friendly MP4
            "-avoid_negative_ts", "make_zero",
            seg_path,
        ]

        logger.info(
            "Segmenting: index=%d  start=%.1f  end=%.1f  cmd=%s",
            index, start, end, " ".join(cmd),
        )
        subprocess.run(cmd, capture_output=True, text=True, check=True)

        segments.append(
            {
                "local_path": seg_path,
                "index": index,
                "start_time_sec": start,
                "end_time_sec": end,
            }
        )

        start += SEGMENT_DURATION_SEC
        index += 1

    logger.info("Segmentation complete: %d segment(s) produced", len(segments))
    return segments


# ──────────────────────────────────────────────
# GCS upload
# ──────────────────────────────────────────────
def _upload_segments(
    segments: list[dict],
    gcs_prefix: str,
) -> list[dict]:
    """Upload local segment files and return metadata with GCS URIs."""
    client = _get_storage_client()
    bucket = client.bucket(PROCESSED_BUCKET)
    metadata: list[dict] = []

    for seg in segments:
        blob_name = f"{gcs_prefix}/seg_{seg['index']}.mp4"
        blob = bucket.blob(blob_name)

        logger.info("Uploading %s → gs://%s/%s", seg["local_path"], PROCESSED_BUCKET, blob_name)
        blob.upload_from_filename(seg["local_path"], content_type="video/mp4")

        metadata.append(
            {
                "segment_gcs_uri": f"gs://{PROCESSED_BUCKET}/{blob_name}",
                "start_time_sec": seg["start_time_sec"],
                "end_time_sec": seg["end_time_sec"],
            }
        )

    logger.info("Upload complete: %d segment(s)", len(metadata))
    return metadata


# ──────────────────────────────────────────────
# Cloud Function entry point
# ──────────────────────────────────────────────
@functions_framework.cloud_event
def segment_video(cloud_event: CloudEvent) -> None:
    """
    Triggered by a *google.cloud.storage.object.v1.finalized* event
    on the ``lectureai_full_videos`` bucket.

    Only processes objects under the ``Lesson_Records/`` prefix.

    Workflow
    --------
    1. Parse event → extract bucket / object name.
    2. Prefix filter — ignore files outside ``Lesson_Records/``.
    3. Idempotency check — skip if segments already exist.
    4. Download video to ``/tmp``.
    5. Probe duration with ``ffprobe``.
    6. Segment with ``ffmpeg -c copy``.
    7. Upload segments to ``lectureai_processed``.
    8. Log metadata JSON.
    9. Clean up ``/tmp``.
    """
    # A unique correlation ID for every invocation
    correlation_id = str(uuid.uuid4())[:8]

    data = cloud_event.data
    source_bucket_name = data["bucket"]
    source_blob_name = data["name"]

    logger.info(
        "[%s] Event received: bucket=%s  object=%s",
        correlation_id, source_bucket_name, source_blob_name,
    )

    # ── 1. Prefix filter ────────────────────
    if not source_blob_name.startswith(EXPECTED_PREFIX):
        logger.info(
            "[%s] Object '%s' is outside prefix '%s' — ignoring.",
            correlation_id, source_blob_name, EXPECTED_PREFIX,
        )
        return

    # Derive a stable prefix from the filename (strip folder + extension)
    # e.g. "Lesson_Records/lecture_01.mp4" → "lecture_01"
    base_name = Path(source_blob_name).stem
    gcs_prefix = base_name

    # ── 2. Idempotency ──────────────────────
    if _segments_already_exist(gcs_prefix):
        logger.info(
            "[%s] Segments already exist under gs://%s/%s/ — skipping.",
            correlation_id, PROCESSED_BUCKET, gcs_prefix,
        )
        return

    # ── 2. Create temp workspace ────────────
    work_dir = tempfile.mkdtemp(prefix="lectureai_")
    local_video_path = os.path.join(work_dir, Path(source_blob_name).name)
    segments_dir = os.path.join(work_dir, "segments")
    os.makedirs(segments_dir, exist_ok=True)

    try:
        # ── 3. Download ─────────────────────
        logger.info("[%s] Downloading gs://%s/%s", correlation_id, source_bucket_name, source_blob_name)
        client = _get_storage_client()
        bucket = client.bucket(source_bucket_name)
        blob = bucket.blob(source_blob_name)
        blob.download_to_filename(local_video_path)

        file_size_mb = os.path.getsize(local_video_path) / (1024 * 1024)
        logger.info("[%s] Download complete: %.1f MiB", correlation_id, file_size_mb)

        # ── 4. Probe duration ────────────────
        duration = _probe_duration(local_video_path)

        # ── 5. Segment ──────────────────────
        segments = _segment_video(local_video_path, segments_dir, duration)

        # ── 6. Upload ───────────────────────
        metadata = _upload_segments(segments, gcs_prefix)

        # ── 7. Log metadata ─────────────────
        logger.info(
            "[%s] RESULT metadata:\n%s",
            correlation_id,
            json.dumps(metadata, indent=2),
        )

    except subprocess.CalledProcessError as exc:
        logger.error(
            "[%s] FFmpeg/FFprobe failed (exit %d): stderr=%s",
            correlation_id, exc.returncode, exc.stderr,
        )
        raise RuntimeError(
            f"FFmpeg processing failed for {source_blob_name}"
        ) from exc

    except Exception:
        logger.exception("[%s] Unexpected error during processing", correlation_id)
        raise

    finally:
        # ── 8. Clean up /tmp ────────────────
        shutil.rmtree(work_dir, ignore_errors=True)
        logger.info("[%s] Temp workspace cleaned up: %s", correlation_id, work_dir)
