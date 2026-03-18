import cv2
import pandas as pd

from video.frame_extractor import sample_frames_by_time, crop_roi
from video.face_metrics import FaceMetrics
from video.gesture_metrics import GestureMetrics
from video.movement_analysis import MovementAnalyzer
from video.teacher_locator import TeacherLocator


def standardize_crop(tile_bgr, out_size=(384, 384)):
    return cv2.resize(tile_bgr, out_size, interpolation=cv2.INTER_AREA)


def run_dynamic_visual_poc(
    video_path: str,
    teacher_name: str,
    analysis_interval_sec: float = 2.0,
    relocalize_interval_sec: float = 10.0,
    smile_threshold: float = 0.35,
    metric_size=(384, 384),
    start_sec: float = 0.0,
    end_sec: float = None,
):
    locator = TeacherLocator(teacher_name=teacher_name)
    face = FaceMetrics()
    gesture = GestureMetrics()
    movement = MovementAnalyzer()

    total_sampled_frames = 0
    located_frames = 0
    face_frames = 0
    smile_frames = 0
    hand_frames = 0
    movement_vals = []

    last_bbox = None
    last_ocr_t = None

    debug_rows = []

    for frame_idx, (t_sec, frame) in enumerate(
        sample_frames_by_time(
            video_path=video_path,
            sample_every_sec=analysis_interval_sec,
            start_sec=start_sec,
            end_sec=end_sec
        )
    ):
        total_sampled_frames += 1

        loc = None
        must_relocalize = (
            last_bbox is None
            or last_ocr_t is None
            or (t_sec - last_ocr_t) >= relocalize_interval_sec
        )

        if not must_relocalize and last_bbox is not None:
            loc = locator.validate_previous(frame, last_bbox)

        if loc is None or not loc["found"]:
            loc = locator.locate_teacher(frame)
            if loc["found"]:
                last_bbox = loc["tile_bbox"]
                last_ocr_t = t_sec
            else:
                last_bbox = None

        if not loc["found"]:
            movement.reset()
            debug_rows.append({
                "frame_idx": frame_idx,
                "t_sec": t_sec,
                "teacher_found": False,
                "source": loc["source"],
                "label_text": None,
                "label_conf": 0.0,
                "match_score": 0.0,
                "tile_x": None,
                "tile_y": None,
                "tile_w": None,
                "tile_h": None,
                "face_detected_metric": False,
                "smile_score": None,
                "hands_detected": None,
                "movement_energy": None,
            })
            continue

        located_frames += 1

        x, y, w, h = loc["tile_bbox"]
        teacher_tile = crop_roi(frame, (x, y, w, h))
        teacher_tile = standardize_crop(teacher_tile, out_size=metric_size)

        fm = face.compute(teacher_tile)
        gm = gesture.compute(teacher_tile)
        mv = movement.update(teacher_tile)

        if fm.get("face_detected"):
            face_frames += 1
            if fm.get("smile_score", -999) >= smile_threshold:
                smile_frames += 1

        if gm.get("hands_detected", 0) > 0:
            hand_frames += 1

        movement_vals.append(mv["movement_energy"])

        debug_rows.append({
            "frame_idx": frame_idx,
            "t_sec": t_sec,
            "teacher_found": True,
            "source": loc["source"],
            "label_text": loc["label_text"],
            "label_conf": loc["label_conf"],
            "match_score": loc["match_score"],
            "tile_x": x,
            "tile_y": y,
            "tile_w": w,
            "tile_h": h,
            "face_detected_metric": fm.get("face_detected", False),
            "smile_score": fm.get("smile_score"),
            "hands_detected": gm.get("hands_detected"),
            "movement_energy": mv.get("movement_energy"),
        })

    summary = {
        "analysis_interval_sec": analysis_interval_sec,
        "relocalize_interval_sec": relocalize_interval_sec,
        "frames_total_sampled": total_sampled_frames,
        "teacher_located_frames": located_frames,
        "teacher_locate_ratio": (located_frames / total_sampled_frames) if total_sampled_frames else 0.0,
        "face_detect_ratio": (face_frames / located_frames) if located_frames else 0.0,
        "smile_frame_ratio": (smile_frames / face_frames) if face_frames else 0.0,
        "hand_visible_ratio": (hand_frames / located_frames) if located_frames else 0.0,
        "movement_energy_avg": (sum(movement_vals) / len(movement_vals)) if movement_vals else 0.0,
    }

    debug_df = pd.DataFrame(debug_rows)
    return summary, debug_df