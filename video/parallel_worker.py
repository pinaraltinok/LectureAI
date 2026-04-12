"""
Parallel segment processing worker.
Usage: python parallel_worker.py <worker_id> <segment_list_json> <config_json> <output_dir>
"""
import sys, os, json, time

def main():
    worker_id = int(sys.argv[1])
    segments = json.loads(sys.argv[2])
    config = json.loads(sys.argv[3])
    output_dir = sys.argv[4]

    # ── Setup ──
    sys.path.insert(0, config["repo_dir"])
    os.chdir(config["repo_dir"])
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = config["credential_path"]

    from pathlib import Path
    import pandas as pd
    from video.dynamic_visual_pipeline import run_dynamic_visual_poc
    from video.frame_extractor import get_video_meta

    tag = f"[Worker-{worker_id}]"
    print(f"{tag} Baslatildi, {len(segments)} segment islenecek", flush=True)

    results = []
    for i, blob_name in enumerate(segments):
        seg_name = Path(blob_name).name
        seg_stem = Path(seg_name).stem
        local_video = os.path.join(config["segment_dir"], seg_name)
        seg_output = os.path.join(output_dir, seg_stem)
        os.makedirs(seg_output, exist_ok=True)

        t0 = time.time()
        print(f"{tag} [{i+1}/{len(segments)}] {seg_name} isleniyor...", flush=True)

        meta = get_video_meta(local_video)

        summary, debug_df = run_dynamic_visual_poc(
            video_path=local_video,
            teacher_name=config["teacher_name"],
            analysis_interval_sec=config["analysis_interval_sec"],
            relocalize_interval_sec=config["relocalize_interval_sec"],
            smile_threshold=config["smile_threshold"],
            start_sec=0.0,
            end_sec=None,
            only_camera_open_frames=True,
            debug_dir=None,
        )

        summary.update({
            "bucket": config["bucket_name"],
            "blob": blob_name,
            "segment_name": seg_name,
            "teacher_name": config["teacher_name"],
            "video_duration_sec": meta["duration_sec"],
            "video_fps": meta["fps"],
            "video_width": meta["width"],
            "video_height": meta["height"],
        })

        # Save per-segment outputs
        with open(os.path.join(seg_output, "summary.json"), "w") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        debug_df.to_csv(os.path.join(seg_output, "debug.csv"), index=False)

        elapsed = time.time() - t0
        print(f"{tag} [{i+1}/{len(segments)}] {seg_name} tamamlandi: {elapsed:.1f}sn", flush=True)
        results.append(summary)

    # Write worker results
    worker_result_path = os.path.join(output_dir, f"_worker_{worker_id}_results.json")
    with open(worker_result_path, "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"{tag} Tamamlandi! Sonuclar: {worker_result_path}", flush=True)


if __name__ == "__main__":
    main()
