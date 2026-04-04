import cv2
import numpy as np


class MovementAnalyzer:
    def __init__(self, diff_thresh: int = 25):
        self.prev_gray = None
        self.diff_thresh = diff_thresh

    def reset(self):
        self.prev_gray = None

    def update(self, frame_bgr):
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)

        if self.prev_gray is None:
            self.prev_gray = gray
            return {"movement_energy": 0.0}

        diff = cv2.absdiff(gray, self.prev_gray)
        _, th = cv2.threshold(diff, self.diff_thresh, 255, cv2.THRESH_BINARY)
        self.prev_gray = gray

        energy = float(np.mean(th > 0))
        return {"movement_energy": energy}