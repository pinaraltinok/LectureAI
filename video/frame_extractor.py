import cv2

def get_video_meta(video_path: str):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration_sec = (frame_count / fps) if frame_count and fps else 0.0

    cap.release()

    return {
        "fps": float(fps),
        "frame_count": frame_count,
        "width": width,
        "height": height,
        "duration_sec": float(duration_sec),
    }


def sample_frames_by_time(
    video_path: str,
    sample_every_sec: float = 2.0,
    start_sec: float = 0.0,
    end_sec: float = None,
):
    if sample_every_sec <= 0:
        raise ValueError("sample_every_sec must be > 0")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_sec = (frame_count / fps) if frame_count and fps else None

    if end_sec is None and duration_sec is not None:
        end_sec = duration_sec
    elif duration_sec is not None:
        end_sec = min(end_sec, duration_sec)

    t_sec = max(0.0, start_sec)

    try:
        while True:
            if end_sec is not None and t_sec > end_sec:
                break

            cap.set(cv2.CAP_PROP_POS_MSEC, t_sec * 1000.0)
            ok, frame = cap.read()
            if not ok:
                break

            yield round(t_sec, 3), frame
            t_sec += sample_every_sec
    finally:
        cap.release()


def crop_roi(frame_bgr, roi):
    x, y, w, h = roi
    h_img, w_img = frame_bgr.shape[:2]

    x = max(0, min(int(x), w_img - 1))
    y = max(0, min(int(y), h_img - 1))
    w = max(1, min(int(w), w_img - x))
    h = max(1, min(int(h), h_img - y))

    return frame_bgr[y:y+h, x:x+w]