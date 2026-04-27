import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import TYPE_CHECKING

from google.cloud import storage

if TYPE_CHECKING:
    from google.auth.credentials import Credentials

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _source_bucket() -> str:
    return (
        os.environ.get("GCS_FULL_VIDEOS_BUCKET") or os.environ.get("GCS_BUCKET_VIDEOS") or "lectureai_full_videos"
    ).strip()


def _source_prefix() -> str:
    p = (os.environ.get("CV_GCS_VIDEO_PREFIX") or "Lesson_Records").strip().strip("/")
    return p or "Lesson_Records"


def _output_bucket() -> str:
    return (
        os.environ.get("GCS_BUCKET_PROCESSED") or os.environ.get("GCS_BUCKET_NAME") or "lectureai_processed"
    ).strip()


def _output_prefix() -> str:
    p = (os.environ.get("CV_GCS_RESULTS_PREFIX") or "results").strip().strip("/")
    return p or "results"


def download_video(client: storage.Client, video_id: str, destination_path: str) -> str:
    bucket_name = _source_bucket()
    prefix = _source_prefix()
    bucket = client.bucket(bucket_name)
    tried: list[str] = []
    for suffix in ("", ".mp4", ".MP4"):
        blob_name = f"{prefix}/{video_id}{suffix}"
        tried.append(f"gs://{bucket_name}/{blob_name}")
        blob = bucket.blob(blob_name)
        if blob.exists(client):
            blob.download_to_filename(destination_path)
            return blob_name
    raise FileNotFoundError(f"Source video not found (tried): {', '.join(tried)}")


def upload_report(client: storage.Client, video_id: str, report: dict) -> str:
    blob_name = f"{_output_prefix()}/{video_id}/lecture_report.json"
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    bucket = client.bucket(_output_bucket())
    blob = bucket.blob(blob_name)
    blob.upload_from_string(payload, content_type="application/json; charset=utf-8")
    return f"gs://{_output_bucket()}/{blob_name}"


def run(
    video_id: str,
    teacher_name: str,
    *,
    credentials: "Credentials | None" = None,
) -> str:
    from src.cv_video_id import normalize_cv_video_id

    from video.dynamic_visual_pipeline import run_dynamic_visual_poc
    from video.frame_extractor import get_video_meta

    video_id = normalize_cv_video_id(video_id)
    if not video_id:
        raise ValueError("video_id is empty after normalization")

    start_ts = time.time()
    print(
        f"[cv_engine] START video_id={video_id} teacher_name={teacher_name!r}",
        flush=True,
    )
    client = storage.Client(credentials=credentials) if credentials is not None else storage.Client()
    with tempfile.TemporaryDirectory(prefix="cv-engine-") as temp_dir:
        local_video_path = os.path.join(temp_dir, f"{video_id}.mp4")
        print(
            f"[cv_engine] DOWNLOAD_START bucket={_source_bucket()} prefix={_source_prefix()} video_id={video_id}",
            flush=True,
        )
        source_blob = download_video(client, video_id, local_video_path)
        print(f"[cv_engine] DOWNLOAD_DONE source_blob={source_blob}", flush=True)

        meta = get_video_meta(local_video_path)
        print(
            f"[cv_engine] META_DONE duration_sec={meta.get('duration_sec')} fps={meta.get('fps')}",
            flush=True,
        )
        print("[cv_engine] ANALYSIS_START", flush=True)
        summary, _ = run_dynamic_visual_poc(
            video_path=local_video_path,
            teacher_name=teacher_name,
            analysis_interval_sec=2.0,
            relocalize_interval_sec=10.0,
            smile_threshold=0.35,
            start_sec=0.0,
            end_sec=None,
            only_camera_open_frames=True,
            debug_dir=None,
        )
        print("[cv_engine] ANALYSIS_DONE", flush=True)

        print("[cv_engine] SAVE_START", flush=True)
        summary.update(
            {
                "video_id": video_id,
                "teacher_name": teacher_name,
                "source_bucket": _source_bucket(),
                "source_blob": source_blob,
                "video_duration_sec": meta["duration_sec"],
                "video_fps": meta["fps"],
                "video_width": meta["width"],
                "video_height": meta["height"],
            }
        )
        print(
            f"[cv_engine] UPLOAD_START bucket={_output_bucket()} prefix={_output_prefix()}",
            flush=True,
        )
        output_uri = upload_report(client, video_id, summary)
        print("[cv_engine] SAVE_END", flush=True)
        elapsed = time.time() - start_ts
        print(f"[cv_engine] DONE output_uri={output_uri} elapsed_sec={elapsed:.1f}", flush=True)
        return output_uri


def main() -> int:
    parser = argparse.ArgumentParser(description="CV engine GCS wrapper")
    parser.add_argument("--video-id", required=True, help="Video ID without .mp4")
    parser.add_argument(
        "--teacher-name",
        default=os.getenv("CV_TEACHER_NAME", "Teacher"),
        help="Teacher name used by OCR tracker (default: CV_TEACHER_NAME or 'Teacher')",
    )
    args = parser.parse_args()

    try:
        output_uri = run(video_id=args.video_id, teacher_name=args.teacher_name)
        print(f"CV pipeline completed: {output_uri}")
        return 0
    except Exception as exc:
        print(f"CV pipeline failed for {args.video_id}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
