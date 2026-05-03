import cv2
import mediapipe as mp

mp_hands = mp.solutions.hands


class GestureMetrics:
    def __init__(self):
        self.hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.5
        )

    def compute(self, frame_bgr):
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        res = self.hands.process(rgb)
        hand_count = 0 if res.multi_hand_landmarks is None else len(res.multi_hand_landmarks)
        return {"hands_detected": hand_count}