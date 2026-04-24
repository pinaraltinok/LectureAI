import cv2
import mediapipe as mp
import mediapipe.python.solutions.face_mesh as mp_face_pkg
import numpy as np

mp_face = mp_face_pkg


class FaceMetrics:
    def __init__(self):
        self.face = mp_face.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True
        )

    def _lm_to_xy(self, lm, w, h):
        return np.array([lm.x * w, lm.y * h], dtype=np.float32)

    def compute(self, frame_bgr):
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        res = self.face.process(rgb)

        if not res.multi_face_landmarks:
            return {"face_detected": False}

        h, w = frame_bgr.shape[:2]
        lms = res.multi_face_landmarks[0].landmark

        left = self._lm_to_xy(lms[61], w, h)
        right = self._lm_to_xy(lms[291], w, h)
        upper = self._lm_to_xy(lms[13], w, h)
        lower = self._lm_to_xy(lms[14], w, h)

        mouth_width = float(np.linalg.norm(right - left))
        mouth_open = float(np.linalg.norm(lower - upper))

        eye_l = self._lm_to_xy(lms[33], w, h)
        eye_r = self._lm_to_xy(lms[263], w, h)
        face_scale = float(np.linalg.norm(eye_r - eye_l)) + 1e-6

        width_n = mouth_width / face_scale
        open_n = mouth_open / face_scale
        smile_score = width_n - 0.5 * open_n

        return {
            "face_detected": True,
            "mouth_width_n": width_n,
            "mouth_open_n": open_n,
            "smile_score": smile_score,
        }