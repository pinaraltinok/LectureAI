import os
import sys
import argparse
import pandas as pd
import json

from video.dynamic_visual_pipeline import run_dynamic_visual_poc
from video.frame_extractor import get_video_meta

def main():
    parser = argparse.ArgumentParser(description="Test visual pipeline locally")
    parser.add_argument("--video", required=True, help="Path to local .mp4 video")
    parser.add_argument("--teacher_name", required=True, help="Name of the teacher on screen")
    parser.add_argument("--output_dir", default="outputs", help="Directory to save output")
    parser.add_argument("--save_frames", action="store_true", help="Save frames with drawn metrics")
    
    parser.add_argument("--analysis_interval_sec", type=float, default=2.0)
    parser.add_argument("--relocalize_interval_sec", type=float, default=10.0)
    parser.add_argument("--smile_threshold", type=float, default=0.35)
    parser.add_argument("--start_sec", type=float, default=0.0)
    parser.add_argument("--end_sec", type=float, default=None)

    args = parser.parse_args()

    if not os.path.exists(args.video):
        print(f"Error: Video file {args.video} not found.")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    try:
        meta = get_video_meta(args.video)
        print("Video meta:", meta)
    except Exception as e:
        print(f"Could not get video meta: {e}")
        meta = {}

    debug_frames_dir = os.path.join(args.output_dir, "frames") if args.save_frames else None

    summary, debug_df = run_dynamic_visual_poc(
        video_path=args.video,
        teacher_name=args.teacher_name,
        analysis_interval_sec=args.analysis_interval_sec,
        relocalize_interval_sec=args.relocalize_interval_sec,
        smile_threshold=args.smile_threshold,
        start_sec=args.start_sec,
        end_sec=args.end_sec,
        debug_dir=debug_frames_dir,
    )

    summary.update({
        "teacher_name": args.teacher_name,
        "video_duration_sec": meta.get("duration_sec"),
        "video_fps": meta.get("fps"),
        "video_width": meta.get("width"),
        "video_height": meta.get("height"),
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
