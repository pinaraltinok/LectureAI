import os
import json
import argparse
import pandas as pd
from google.cloud import storage

from video.dynamic_visual_pipeline import run_dynamic_visual_poc
from video.frame_extractor import get_video_meta


def download_blob(bucket_name, source_blob_name, destination_file_name):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(source_blob_name)

    os.makedirs(os.path.dirname(destination_file_name), exist_ok=True)
    blob.download_to_filename(destination_file_name)
    print(f"Downloaded: gs://{bucket_name}/{source_blob_name} -> {destination_file_name}")


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--bucket", required=True)
    parser.add_argument("--blob", required=True)
    parser.add_argument("--teacher_name", required=True)

    parser.add_argument("--local_video", default="/content/work/input_video.mp4")
    parser.add_argument("--output_dir", default="/content/work/outputs")

    parser.add_argument("--analysis_interval_sec", type=float, default=2.0)
    parser.add_argument("--relocalize_interval_sec", type=float, default=10.0)
    parser.add_argument("--smile_threshold", type=float, default=0.35)
    parser.add_argument("--start_sec", type=float, default=0.0)
    parser.add_argument("--end_sec", type=float, default=None)

    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    download_blob(args.bucket, args.blob, args.local_video)

    meta = get_video_meta(args.local_video)
    print("Video meta:", meta)

    summary, debug_df = run_dynamic_visual_poc(
        video_path=args.local_video,
        teacher_name=args.teacher_name,
        analysis_interval_sec=args.analysis_interval_sec,
        relocalize_interval_sec=args.relocalize_interval_sec,
        smile_threshold=args.smile_threshold,
        start_sec=args.start_sec,
        end_sec=args.end_sec,
    )

    summary.update({
        "bucket": args.bucket,
        "blob": args.blob,
        "teacher_name": args.teacher_name,
        "video_duration_sec": meta["duration_sec"],
        "video_fps": meta["fps"],
        "video_width": meta["width"],
        "video_height": meta["height"],
    })

    summary_json = os.path.join(args.output_dir, "summary.json")
    summary_csv = os.path.join(args.output_dir, "summary.csv")
    debug_csv = os.path.join(args.output_dir, "debug.csv")

    with open(summary_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    pd.DataFrame([summary]).to_csv(summary_csv, index=False)
    debug_df.to_csv(debug_csv, index=False)

    print("Saved:")
    print(summary_json)
    print(summary_csv)
    print(debug_csv)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()