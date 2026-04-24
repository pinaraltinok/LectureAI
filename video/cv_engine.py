import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from google.cloud import storage

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


SOURCE_BUCKET = "lectureai_full_videos"
SOURCE_PREFIX = "Lesson_Records"
OUTPUT_BUCKET = "lectureai_processed"
OUTPUT_PREFIX = "results"


def download_video(client: storage.Client, video_id: str, destination_path: str) -> str:
    blob_name = f"{SOURCE_PREFIX}/{video_id}.mp4"
    bucket = client.bucket(SOURCE_BUCKET)
    blob = bucket.blob(blob_name)
    if not blob.exists(client):
        raise FileNotFoundError(f"Source video not found: gs://{SOURCE_BUCKET}/{blob_name}")

    blob.download_to_filename(destination_path)
    return blob_name


def upload_report(client: storage.Client, video_id: str, report: dict) -> str:
    blob_name = f"{OUTPUT_PREFIX}/{video_id}/lecture_report.json"
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    bucket = client.bucket(OUTPUT_BUCKET)
    blob = bucket.blob(blob_name)
    blob.upload_from_string(payload, content_type="application/json; charset=utf-8")
    return f"gs://{OUTPUT_BUCKET}/{blob_name}"


def run(video_id: str, teacher_name: str) -> str:
    from video.dynamic_visual_pipeline import run_dynamic_visual_poc
    from video.frame_extractor import get_video_meta

    client = storage.Client()
    with tempfile.TemporaryDirectory(prefix="cv-engine-") as temp_dir:
        local_video_path = os.path.join(temp_dir, f"{video_id}.mp4")
        source_blob = download_video(client, video_id, local_video_path)

        meta = get_video_meta(local_video_path)
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

        summary.update(
            {
                "video_id": video_id,
                "teacher_name": teacher_name,
                "source_bucket": SOURCE_BUCKET,
                "source_blob": source_blob,
                "video_duration_sec": meta["duration_sec"],
                "video_fps": meta["fps"],
                "video_width": meta["width"],
                "video_height": meta["height"],
            }
        )
        return upload_report(client, video_id, summary)


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
