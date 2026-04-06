import cv2
import easyocr
import mediapipe as mp
import numpy as np
import unicodedata
from difflib import SequenceMatcher

from video.frame_extractor import crop_roi


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    cleaned = []
    for ch in text:
        if ch.isalnum() or ch.isspace():
            cleaned.append(ch)
    return " ".join("".join(cleaned).split())


class TeacherLocator:
    def __init__(
        self,
        teacher_name: str,
        languages=None,
        match_threshold: float = 0.45,
        dark_thresh: int = 18,
        min_component_area: int = 20000,
        min_detection_confidence: float = 0.5,
    ):
        import torch

        self.teacher_name = normalize_text(teacher_name)
        self.teacher_tokens = set(self.teacher_name.split())
        self.match_threshold = match_threshold
        self.dark_thresh = dark_thresh
        self.min_component_area = min_component_area

        if languages is None:
            languages = ["en"]

        self.reader = easyocr.Reader(languages, gpu=torch.cuda.is_available())
        self.face_detector = mp.solutions.face_detection.FaceDetection(
            model_selection=0,
            min_detection_confidence=min_detection_confidence
        )

    def _clip_roi(self, roi, frame_shape):
        x, y, w, h = roi
        H, W = frame_shape[:2]

        x = max(0, min(int(x), W - 1))
        y = max(0, min(int(y), H - 1))
        w = max(1, min(int(w), W - x))
        h = max(1, min(int(h), H - y))

        return (x, y, w, h)

    def _token_overlap(self, text: str) -> float:
        tokens = set(normalize_text(text).split())
        if not self.teacher_tokens:
            return 0.0
        return len(tokens & self.teacher_tokens) / len(self.teacher_tokens)

    def _text_match_score(self, text: str) -> float:
        norm_text = normalize_text(text)
        if not norm_text:
            return 0.0

        if self.teacher_name in norm_text or norm_text in self.teacher_name:
            return 1.0

        ratio = SequenceMatcher(None, norm_text, self.teacher_name).ratio()
        overlap = self._token_overlap(text)
        return max(ratio, overlap)

    def _extract_tile_boxes(self, frame_bgr):
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        mask = (gray > self.dark_thresh).astype(np.uint8) * 255

        kernel = np.ones((7, 7), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)

        h, w = frame_bgr.shape[:2]
        frame_area = h * w
        adaptive_min_area = max(self.min_component_area, int(frame_area * 0.01))

        boxes = []
        for i in range(1, num_labels):
            x, y, bw, bh, area = stats[i]
            coverage = area / float(frame_area + 1e-6)

            if area < adaptive_min_area:
                continue
            if coverage > 0.95:
                continue

            boxes.append((int(x), int(y), int(bw), int(bh)))

        return boxes

    def _estimate_tile_from_label(self, frame_shape, pts):
        pts_np = np.array(pts, dtype=np.float32)
        x1, y1 = pts_np.min(axis=0)
        x2, y2 = pts_np.max(axis=0)

        lw = max(1.0, x2 - x1)
        lh = max(1.0, y2 - y1)
        cx = (x1 + x2) / 2.0

        tile_w = max(int(lw * 6.0), 240)
        tile_h = max(int(lh * 10.0), 180)

        x = int(cx - tile_w / 2.0)
        y = int(y1 - tile_h + lh * 2.0)

        return self._clip_roi((x, y, tile_w, tile_h), frame_shape)

    def _find_component_for_label(self, boxes, frame_shape, pts):
        if not boxes:
            return self._estimate_tile_from_label(frame_shape, pts)

        pts_np = np.array(pts, dtype=np.float32)
        cx = float(np.mean(pts_np[:, 0]))
        cy = float(np.mean(pts_np[:, 1]))

        containing = []
        for box in boxes:
            x, y, w, h = box
            if x <= cx <= x + w and y <= cy <= y + h:
                containing.append(box)

        if containing:
            containing.sort(key=lambda b: b[2] * b[3])
            return containing[0]

        best_box = None
        best_dist = float("inf")
        for box in boxes:
            x, y, w, h = box
            bx = x + w / 2.0
            by = y + h / 2.0
            dist = (bx - cx) ** 2 + (by - cy) ** 2
            if dist < best_dist:
                best_dist = dist
                best_box = box

        return best_box if best_box is not None else self._estimate_tile_from_label(frame_shape, pts)

    def _detect_face_in_tile(self, tile_bgr):
        rgb = cv2.cvtColor(tile_bgr, cv2.COLOR_BGR2RGB)
        res = self.face_detector.process(rgb)

        if not res.detections:
            return False, None

        h, w = tile_bgr.shape[:2]
        best_area = -1
        best_bbox = None

        for det in res.detections:
            box = det.location_data.relative_bounding_box
            x = max(0, int(box.xmin * w))
            y = max(0, int(box.ymin * h))
            bw = max(1, int(box.width * w))
            bh = max(1, int(box.height * h))
            area = bw * bh

            if area > best_area:
                best_area = area
                best_bbox = (x, y, bw, bh)

        return True, best_bbox

    def validate_previous(self, frame_bgr, prev_bbox):
        tile = crop_roi(frame_bgr, prev_bbox)
        face_found, face_bbox = self._detect_face_in_tile(tile)

        if face_found:
            return {
                "found": True,
                "tile_bbox": prev_bbox,
                "label_text": None,
                "label_conf": 0.0,
                "match_score": 0.0,
                "face_found": True,
                "face_bbox_local": face_bbox,
                "source": "tracking",
            }

        return {
            "found": False,
            "tile_bbox": None,
            "label_text": None,
            "label_conf": 0.0,
            "match_score": 0.0,
            "face_found": False,
            "face_bbox_local": None,
            "source": "tracking",
        }

    def locate_teacher(self, frame_bgr, ocr_scale=0.5):
        boxes = self._extract_tile_boxes(frame_bgr)
        
        if ocr_scale < 1.0:
            h, w = frame_bgr.shape[:2]
            scaled = cv2.resize(frame_bgr, (int(w * ocr_scale), int(h * ocr_scale)))
            ocr_results = self.reader.readtext(scaled, detail=1, paragraph=False)
            
            scaled_ocr = []
            for pts, text, conf in ocr_results:
                scaled_pts = [[p[0] / ocr_scale, p[1] / ocr_scale] for p in pts]
                scaled_ocr.append((scaled_pts, text, conf))
            ocr_results = scaled_ocr
        else:
            ocr_results = self.reader.readtext(frame_bgr, detail=1, paragraph=False)

        best = None
        best_total_score = -1.0

        for item in ocr_results:
            if len(item) != 3:
                continue

            pts, text, conf = item
            match_score = self._text_match_score(text)

            if match_score < self.match_threshold:
                continue

            tile_bbox = self._find_component_for_label(boxes, frame_bgr.shape, pts)
            if tile_bbox is None:
                continue

            tile = crop_roi(frame_bgr, tile_bbox)
            face_found, face_bbox = self._detect_face_in_tile(tile)

            if (not face_found) and match_score < 0.95:
                continue

            total_score = float(match_score) + 0.15 * float(conf) + (0.20 if face_found else 0.0)

            if total_score > best_total_score:
                best_total_score = total_score
                best = {
                    "found": True,
                    "tile_bbox": tile_bbox,
                    "label_text": text,
                    "label_conf": float(conf),
                    "match_score": float(match_score),
                    "face_found": bool(face_found),
                    "face_bbox_local": face_bbox,
                    "source": "ocr",
                }

        if best is None:
            return {
                "found": False,
                "tile_bbox": None,
                "label_text": None,
                "label_conf": 0.0,
                "match_score": 0.0,
                "face_found": False,
                "face_bbox_local": None,
                "source": "ocr",
            }

        return best