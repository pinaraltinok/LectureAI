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
    only_camera_open_frames: bool = True,
    debug_dir: str = None,
):
    locator = TeacherLocator(teacher_name=teacher_name)
    face = FaceMetrics()
    gesture = GestureMetrics()
    movement = MovementAnalyzer()

    total_sampled_frames = 0
    located_frames = 0
    camera_open_frames = 0
    smile_frames = 0
    hand_frames = 0
    movement_vals = []

    last_bbox = None
    last_ocr_t = None
    ocr_backoff_until = 0.0

    if debug_dir is not None:
        import os
        os.makedirs(debug_dir, exist_ok=True)

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
            if t_sec >= ocr_backoff_until:
                loc = locator.locate_teacher(frame, ocr_scale=1.0)
                if loc["found"]:
                    last_bbox = loc["tile_bbox"]
                    last_ocr_t = t_sec
                else:
                    last_bbox = None
                    ocr_backoff_until = t_sec + 5.0
            else:
                loc = {
                    "found": False,
                    "tile_bbox": None,
                    "source": "backoff",
                    "label_text": None,
                    "label_conf": 0.0,
                    "match_score": 0.0,
                    "face_found": False,
                    "face_bbox_local": None,
                }
                last_bbox = None

        if not loc["found"]:
            movement.reset()
            debug_rows.append({
                "frame_idx": frame_idx,
                "t_sec": t_sec,
                "teacher_found": False,
                "camera_open_frame": False,
                "used_for_metrics": False,
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
            if debug_dir is not None:
                import os
                draw_frame = frame.copy()
                cv2.putText(draw_frame, "TEACHER NOT FOUND", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 3)
                out_path = os.path.join(debug_dir, f"frame_{frame_idx:04d}_notfound.jpg")
                cv2.imwrite(out_path, draw_frame)
            continue

        located_frames += 1

        x, y, w, h = loc["tile_bbox"]
        
        if loc.get("face_found") and loc.get("face_bbox_local"):
            fx, fy, fw, fh = loc["face_bbox_local"]
            gx = x + fx
            gy = y + fy
            cx = gx + fw / 2.0
            
            mw = int(fw * 4.0)
            mh = int(fh * 4.5)
            
            mx = int(cx - mw / 2.0)
            my = int(gy - fh * 1.0)
            
            H, W = frame.shape[:2]
            mx = max(0, min(mx, W - 1))
            my = max(0, min(my, H - 1))
            mw = max(1, min(mw, W - mx))
            mh = max(1, min(mh, H - my))
            
            metric_bbox = (mx, my, mw, mh)
        else:
            metric_bbox = (x, y, w, h)

        mx, my, mw, mh = metric_bbox

        teacher_tile = crop_roi(frame, (mx, my, mw, mh))
        teacher_tile = standardize_crop(teacher_tile, out_size=metric_size)

        fm = face.compute(teacher_tile)
        face_detected = bool(fm.get("face_detected", False))

        if only_camera_open_frames and not face_detected:
            movement.reset()
            debug_rows.append({
                "frame_idx": frame_idx,
                "t_sec": t_sec,
                "teacher_found": True,
                "camera_open_frame": False,
                "used_for_metrics": False,
                "source": loc["source"],
                "label_text": loc["label_text"],
                "label_conf": loc["label_conf"],
                "match_score": loc["match_score"],
                "tile_x": x,
                "tile_y": y,
                "tile_w": w,
                "tile_h": h,
                "face_detected_metric": False,
                "smile_score": None,
                "hands_detected": None,
                "movement_energy": None,
            })
            if debug_dir is not None:
                import os
                draw_frame = frame.copy()
                cv2.rectangle(draw_frame, (x, y), (x+w, y+h), (0, 165, 255), 2)
                cv2.putText(draw_frame, "NO FACE IN BOX", (x, max(30, y - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
                out_path = os.path.join(debug_dir, f"frame_{frame_idx:04d}_noface.jpg")
                cv2.imwrite(out_path, draw_frame)
            continue

        camera_open_frames += 1

        gm = gesture.compute(teacher_tile)
        mv = movement.update(teacher_tile)

        if fm.get("smile_score", -999) >= smile_threshold:
            smile_frames += 1

        if gm.get("hands_detected", 0) > 0:
            hand_frames += 1

        movement_vals.append(mv["movement_energy"])

        debug_rows.append({
            "frame_idx": frame_idx,
            "t_sec": t_sec,
            "teacher_found": True,
            "camera_open_frame": face_detected,
            "used_for_metrics": True,
            "source": loc["source"],
            "label_text": loc["label_text"],
            "label_conf": loc["label_conf"],
            "match_score": loc["match_score"],
            "tile_x": x,
            "tile_y": y,
            "tile_w": w,
            "tile_h": h,
            "face_detected_metric": face_detected,
            "smile_score": fm.get("smile_score"),
            "hands_detected": gm.get("hands_detected"),
            "movement_energy": mv.get("movement_energy"),
        })

        if debug_dir is not None:
            import os
            draw_frame = frame.copy()
            # Draw tracking bbox (blue)
            cv2.rectangle(draw_frame, (x, y), (x+w, y+h), (255, 0, 0), 2)
            # Draw metric bbox (green)
            cv2.rectangle(draw_frame, (mx, my), (mx+mw, my+mh), (0, 255, 0), 3)
            
            y_offset = max(20, my - 10)
            texts = [
                f"Face: {face_detected}",
                f"Smile: {fm.get('smile_score', 0):.2f}" if fm.get("smile_score") is not None else "Smile: N/A",
                f"Hands: {gm.get('hands_detected', 0)}",
                f"Movement: {mv.get('movement_energy', 0):.2f}"
            ]
            for i, t in enumerate(reversed(texts)):
                cv2.putText(draw_frame, t, (mx, y_offset - i*20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            
            out_path = os.path.join(debug_dir, f"frame_{frame_idx:04d}.jpg")
            cv2.imwrite(out_path, draw_frame)


    summary = {
        "analysis_interval_sec": analysis_interval_sec,
        "relocalize_interval_sec": relocalize_interval_sec,
        "frames_total_sampled": total_sampled_frames,
        "teacher_located_frames": located_frames,
        "camera_open_frames": camera_open_frames,
        "teacher_locate_ratio": (located_frames / total_sampled_frames) if total_sampled_frames else 0.0,
        "camera_open_ratio_total": (camera_open_frames / total_sampled_frames) if total_sampled_frames else 0.0,
        "camera_open_ratio_among_located": (camera_open_frames / located_frames) if located_frames else 0.0,
        "smile_frame_ratio": (smile_frames / camera_open_frames) if camera_open_frames else 0.0,
        "hand_visible_ratio": (hand_frames / camera_open_frames) if camera_open_frames else 0.0,
        "movement_energy_avg": (sum(movement_vals) / len(movement_vals)) if movement_vals else 0.0,
    }

    debug_df = pd.DataFrame(debug_rows)
    return summary, debug_df