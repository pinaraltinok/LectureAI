"""
Student Registry Builder - Phase 1
===================================
Downloads a lecture video from GCS, scans the first 10 minutes
every 30 seconds to detect and register unique students via face
detection, and outputs a JSON student registry.

Voice binding is done via AssemblyAI speaker diarization on the
first 10 minutes of audio.
"""

import os, sys, json, math, tempfile, hashlib, shutil, io
from pathlib import Path

# Force UTF-8 stdout on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ── GCS setup ──────────────────────────────────────────────────────
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = (
    r"C:\Users\iremd\Downloads\senior-design-488908-28bd7c55329d.json"
)
GCS_PROJECT = "senior-design-488908"
BUCKET_NAME = "lectureai_full_videos"

# ── Pick the video to analyse ─────────────────────────────────────
# Change this to whichever video_id you want:
VIDEO_BLOB = "Lesson_Records/TURPRM1220_WED-18_8-9(M8L2)"
# ── Output dir ────────────────────────────────────────────────────
OUT_DIR = Path(__file__).parent / "registry_output"
OUT_DIR.mkdir(exist_ok=True)
FRAMES_DIR = OUT_DIR / "frames"
FRAMES_DIR.mkdir(exist_ok=True)

PYTHON = sys.executable

# ══════════════════════════════════════════════════════════════════
#  STEP 0 — Download video from GCS
# ══════════════════════════════════════════════════════════════════
def download_video() -> Path:
    """Download the video blob to a local temp file. Returns local path."""
    from google.cloud import storage

    local_path = OUT_DIR / Path(VIDEO_BLOB).name
    if local_path.exists():
        print(f"[✓] Video already downloaded: {local_path}")
        return local_path

    print(f"[↓] Downloading gs://{BUCKET_NAME}/{VIDEO_BLOB} ...")
    client = storage.Client(project=GCS_PROJECT)
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(VIDEO_BLOB)
    blob.download_to_filename(str(local_path))
    size_mb = local_path.stat().st_size / (1024 * 1024)
    print(f"[✓] Downloaded {size_mb:.1f} MB → {local_path}")
    return local_path


# ══════════════════════════════════════════════════════════════════
#  STEP 1 — Visual scan: extract frames every 30s for first 10 min
# ══════════════════════════════════════════════════════════════════
def extract_frames(video_path: Path) -> list[dict]:
    """
    Extract one frame every 30 seconds for the first 10 minutes.
    Returns list of {timestamp_sec, frame_path}.
    """
    import cv2

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps if fps else 0
    print(f"[i] Video: {fps:.1f} FPS, {duration_sec:.0f}s total")

    start_sec = 300  # 5 minutes
    end_sec = min(1500, duration_sec)  # 25 minutes
    interval_sec = 60
    timestamps = list(range(start_sec, int(end_sec) + 1, interval_sec))

    frames_info = []
    for ts in timestamps:
        frame_no = int(ts * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
        ret, frame = cap.read()
        if not ret:
            continue
        frames_info.append({"timestamp_sec": ts, "frame": frame})
        print(f"  [frame] t={ts:>4d}s  →  (kept in memory)")

    cap.release()
    print(f"[✓] Extracted {len(frames_info)} frames")
    return frames_info


# ══════════════════════════════════════════════════════════════════
#  STEP 1b — Detect faces in each frame & cluster unique students
# ══════════════════════════════════════════════════════════════════
def detect_faces_in_frames(frames_info: list[dict]) -> list[dict]:
    """
    Use OpenCV Haar Cascade + DNN face detector to find all faces.
    Uses EasyOCR to find names displayed near faces.
    Returns a list of face crops with positional metadata and extracted names.
    """
    import cv2
    import easyocr
    import math

    print("[i] Loading OCR model...")
    reader = easyocr.Reader(['tr', 'en'], gpu=False)

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)
    profile_path = cv2.data.haarcascades + "haarcascade_profileface.xml"
    profile_cascade = cv2.CascadeClassifier(profile_path)

    all_detections = []

    for fi in frames_info:
        img = fi["frame"]
        if img is None:
            continue
        h, w, _ = img.shape
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(20, 20), flags=cv2.CASCADE_SCALE_IMAGE)
        profiles = profile_cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(20, 20), flags=cv2.CASCADE_SCALE_IMAGE)

        all_rects = list(faces) if len(faces) > 0 else []
        if len(profiles) > 0:
            for p in profiles:
                # crude duplicate check
                px, py, pw, ph = p
                is_dup = False
                for fx, fy, fw, fh in all_rects:
                    if abs(px - fx) < 30 and abs(py - fy) < 30:
                        is_dup = True
                        break
                if not is_dup:
                    all_rects.append(p)

        if not all_rects:
            print(f"  [face] t={fi['timestamp_sec']:3d}s  ->  0 faces")
            continue

        print(f"  [face] t={fi['timestamp_sec']:3d}s  ->  {len(all_rects)} faces, running OCR...")
        ocr_results = reader.readtext(img)

        for i, (x, y, fw, fh) in enumerate(all_rects):
            # Best name heuristic: text center is roughly horizontally aligned, and vertically below or near the face.
            fcx = x + fw / 2
            fcy = y + fh / 2
            
            best_name = None
            min_dist = 999999

            for bbox, text, prob in ocr_results:
                # Kesin isim tespiti için kalite filtreleri (Probability, min length, isalpha)
                if prob < 0.5 or len(text.strip()) < 4 or not any(c.isalpha() for c in text):
                    continue
                    
                # bbox is [(tl_x, tl_y), (tr_x, tr_y), (br_x, br_y), (bl_x, bl_y)]
                tcx = (bbox[0][0] + bbox[1][0]) / 2
                tcy = (bbox[0][1] + bbox[2][1]) / 2
                
                dist = math.sqrt((fcx - tcx)**2 + (fcy - tcy)**2)
                # Distance sınırını 400'den 250 piksele çektik ki sadece yüzün altındaki isimleri alsın
                if dist < 250 and dist < min_dist:
                    min_dist = dist
                    best_name = text

            crop = img[y:y+fh, x:x+fw]

            # Location label
            grid_y = "top" if y < h/3 else "mid" if y < 2*h/3 else "bottom"
            grid_x = "left" if x < w/3 else "center" if x < 2*w/3 else "right"

            all_detections.append({
                "timestamp_sec": fi["timestamp_sec"],
                "box": (int(x), int(y), int(fw), int(fh)),
                "norm_center": ((x + fw/2)/w, (y + fh/2)/h),
                "seat": f"{grid_y}-{grid_x}",
                "confidence": 0.8,
                "crop_img": crop,
                "visual_name": best_name
            })

    print(f"[OK] Total face detections: {len(all_detections)}")
    return all_detections


def cluster_faces_to_students(detections: list[dict]) -> list[dict]:
    """
    Cluster face detections into unique students, and assign real names via OCR if found.
    """
    students = []
    DISTANCE_THRESHOLD = 0.10

    for det in detections:
        cx, cy = det["norm_center"]
        matched = False
        for stu in students:
            sx, sy = stu["_avg_center"]
            dist = math.sqrt((cx - sx) ** 2 + (cy - sy) ** 2)
            if dist < DISTANCE_THRESHOLD:
                stu["_centers"].append((cx, cy))
                stu["_avg_center"] = [
                    sum(c[0] for c in stu["_centers"]) / len(stu["_centers"]),
                    sum(c[1] for c in stu["_centers"]) / len(stu["_centers"]),
                ]
                stu["_detections"].append(det)
                stu["appearances"] += 1
                if det["visual_name"] and not stu.get("visual_name"):
                    stu["visual_name"] = det["visual_name"]
                
                if det["confidence"] > stu["_best_conf"]:
                    stu["_best_conf"] = det["confidence"]
                    stu["best_crop_img"] = det["crop_img"]
                matched = True
                break

        if not matched:
            sid = det.get("visual_name")
            if not sid:
                sid = f"STUDENT_{len(students) + 1:03d}"
            students.append({
                "id": sid,
                "visual_name": det.get("visual_name"),
                "seat": det["seat"],
                "_avg_center": [cx, cy],
                "_centers": [(cx, cy)],
                "_detections": [det],
                "_best_conf": det["confidence"],
                "best_crop_img": det["crop_img"],
                "appearances": 1,
                "first_seen_sec": det["timestamp_sec"],
            })

    # Filter: keep students seen in at least 2 frames (reduce false positives)
    min_appearances = 2 if len(detections) > 10 else 1
    students = [s for s in students if s["appearances"] >= min_appearances]

    import cv2
    import re
    # Re-number unnamed students after filtering, and save only the BEST definitive crop for frontend
    for i, s in enumerate(students):
        if s.get("visual_name"):
            s["id"] = s["visual_name"]
        elif s["id"].startswith("STUDENT_"):
            s["id"] = f"STUDENT_UNNAMED_{i + 1:03d}"
            
        safe_id = re.sub(r"[^\w\s]", "", s["id"]).replace(" ", "_")
        crop_path = Path("registry_output/frames") / f"student_{safe_id}.jpg"
        cv2.imwrite(str(crop_path), s["best_crop_img"])
        s["best_crop"] = str(crop_path)
        del s["best_crop_img"]  # Clean up memory mapping

    print(f"[✓] Clustered into {len(students)} unique students")
    return students


# ══════════════════════════════════════════════════════════════════
#  STEP 2 — Voice binding via speaker diarization (AssemblyAI)
# ══════════════════════════════════════════════════════════════════
def extract_scan_window_audio(video_path: Path) -> Path:
    """
    Extract the 5 to 25 minute window of audio from the video into an mp3.
    Uses imageio_ffmpeg bundled binary, then system ffmpeg as fallback.
    """
    audio_path = OUT_DIR / "scan_window_5_to_25.mp3"
    if audio_path.exists():
        print(f"[OK] Audio already extracted: {audio_path}")
        return audio_path

    import subprocess

    # Find ffmpeg binary: prefer imageio_ffmpeg bundled version
    ffmpeg_bin = None
    try:
        import imageio_ffmpeg
        ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        print(f"[i] Using imageio_ffmpeg binary: {ffmpeg_bin}")
    except ImportError:
        ffmpeg_bin = "ffmpeg"
        print("[i] imageio_ffmpeg not found, trying system ffmpeg")

    try:
        subprocess.run(
            [
                ffmpeg_bin, "-y",
                "-i", str(video_path),
                "-ss", "300",         # start at 5 min
                "-t", "1200",         # extract for 20 min (to reach 25 min)
                "-vn",                # no video
                "-acodec", "libmp3lame",
                "-ar", "16000",       # 16kHz for speech
                "-ac", "1",           # mono
                str(audio_path),
            ],
            check=True,
            capture_output=True,
        )
        size_mb = audio_path.stat().st_size / (1024 * 1024)
        print(f"[OK] Audio extracted: {size_mb:.1f} MB -> {audio_path}")
        return audio_path
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        print(f"[!] ffmpeg failed: {e}")

    # Last resort: send video directly (may timeout for large files)
    print("[!] WARNING: sending full video to AssemblyAI (may timeout)")
    return video_path


def run_speaker_diarization(audio_path: Path) -> list[dict]:
    """
    Run AssemblyAI speaker diarization via REST API.
    Returns list of speaker utterances with timestamps.
    """
    import httpx, time

    ASSEMBLYAI_KEY = "26d7fc8d7690420a81e6987a2b3263c0"
    BASE = "https://api.assemblyai.com/v2"
    HEADERS = {"authorization": ASSEMBLYAI_KEY}

    # 1. Upload the audio file
    print("[>>] Uploading audio to AssemblyAI...")
    with open(audio_path, "rb") as f:
        resp = httpx.post(
            f"{BASE}/upload",
            headers=HEADERS,
            content=f,
            timeout=120,
        )
    resp.raise_for_status()
    upload_url = resp.json()["upload_url"]
    print(f"[OK] Uploaded -> {upload_url[:60]}...")

    # 2. Create transcription with speaker diarization
    print("[>>] Starting transcription with diarization...")
    body = {
        "audio_url": upload_url,
        "speaker_labels": True,
        "language_detection": True,
        "speech_models": ["universal-2"],
    }
    resp = httpx.post(
        f"{BASE}/transcript",
        headers=HEADERS,
        json=body,
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"[!!] API error {resp.status_code}: {resp.text}")
        # Retry with universal-3-pro
        body["speech_models"] = ["universal-3-pro"]
        resp = httpx.post(
            f"{BASE}/transcript",
            headers=HEADERS,
            json=body,
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"[!!] Retry also failed: {resp.text}")
            return []
    transcript_id = resp.json()["id"]
    print(f"[OK] Transcript ID: {transcript_id}")

    # 3. Poll until complete
    poll_url = f"{BASE}/transcript/{transcript_id}"
    while True:
        resp = httpx.get(poll_url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        status = data["status"]
        if status == "completed":
            break
        elif status == "error":
            print(f"[!!] Transcription failed: {data.get('error')}")
            return []
        print(f"  ... status: {status}")
        time.sleep(5)

    # 4. Extract utterances
    utterances = []
    for utt in (data.get("utterances") or []):
        start_ms = utt["start"]
        end_ms = utt["end"]
        if start_ms > 1_200_000:
            break
        utterances.append({
            "speaker": utt["speaker"],
            "start_ms": start_ms,
            "end_ms": end_ms,
            "text": utt["text"][:80],
        })

    speakers = set(u["speaker"] for u in utterances)
    print(f"[OK] Diarization complete: {len(utterances)} utterances, "
          f"{len(speakers)} speakers")
    return utterances


def bind_voices_to_students(
    students: list[dict],
    utterances: list[dict],
) -> list[dict]:
    """
    Bind diarized speakers to student records.

    Heuristic: In a classroom, the teacher typically speaks the most.
    The longest-speaking person is labelled TEACHER and excluded.
    Remaining speakers are mapped to students by order of appearance.
    """
    if not utterances:
        print("[!] No utterances — all students marked VOICE_PENDING")
        for s in students:
            s["voice_confirmed"] = False
            s["voice_notes"] = "VOICE_PENDING"
            s["first_spoke"] = None
        return students

    # Compute total speaking time per speaker
    speaker_durations = {}
    speaker_first_time = {}
    for u in utterances:
        spk = u["speaker"]
        dur = u["end_ms"] - u["start_ms"]
        speaker_durations[spk] = speaker_durations.get(spk, 0) + dur
        if spk not in speaker_first_time:
            speaker_first_time[spk] = u["start_ms"]

    # The speaker with the most talk time is likely the teacher
    teacher_speaker = max(speaker_durations, key=speaker_durations.get)
    teacher_pct = speaker_durations[teacher_speaker] / sum(speaker_durations.values()) * 100
    print(f"[i] Teacher detected: Speaker {teacher_speaker} "
          f"({teacher_pct:.0f}% of talk time)")

    # Remaining speakers sorted by first appearance
    student_speakers = sorted(
        [s for s in speaker_durations if s != teacher_speaker],
        key=lambda s: speaker_first_time[s]
    )

    print(f"[i] Student speakers: {student_speakers}")

    # Map speakers to student records
    for i, s in enumerate(students):
        if i < len(student_speakers):
            spk = student_speakers[i]
            first_ms = speaker_first_time[spk]
            mins = first_ms // 60000
            secs = (first_ms % 60000) // 1000
            s["voice_confirmed"] = True
            s["voice_notes"] = f"Speaker {spk}"
            s["first_spoke"] = f"00:{mins:02d}:{secs:02d}"
        else:
            s["voice_confirmed"] = False
            s["voice_notes"] = "VOICE_PENDING"
            s["first_spoke"] = None

    return students


# ══════════════════════════════════════════════════════════════════
#  BUILD FINAL REGISTRY
# ══════════════════════════════════════════════════════════════════
def build_registry(students: list[dict]) -> list[dict]:
    """Clean up internal fields and produce final registry JSON."""
    registry = []
    for s in students:
        registry.append({
            "id": s["id"],
            "seat": s["seat"],
            "visual_notes": f"seen {s['appearances']}x, best crop: {Path(s['best_crop']).name}",
            "voice_confirmed": s.get("voice_confirmed", False),
            "voice_notes": s.get("voice_notes", "VOICE_PENDING"),
            "first_spoke": s.get("first_spoke"),
        })
    return registry


# ══════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════
def main():
    print("=" * 60)
    print(" STUDENT REGISTRY BUILDER — Phase 1")
    print("=" * 60)

    # 0. Download video
    video_path = download_video()

    # 1. Extract frames every 30s for the 5 to 25 minute window
    print("\n── STEP 1: Visual Scan (5-25 min) ───────────────────")
    frames = extract_frames(video_path)

    # 1b. Detect faces and cluster into unique students
    print("\n── STEP 1b: Face Detection & Clustering ───────────")
    detections = detect_faces_in_frames(frames)
    students = cluster_faces_to_students(detections)

    # Show intermediate results
    print("\n── Preliminary Student List ────────────────────────")
    for s in students:
        print(f"  {s['id']}  seat={s['seat']}  appearances={s['appearances']}")

    # 2. Voice binding
    print("\n── STEP 2: Voice Binding ──────────────────────────")
    audio_path = extract_scan_window_audio(video_path)
    utterances = run_speaker_diarization(audio_path)
    students = bind_voices_to_students(students, utterances)

    # 3. Build final registry
    print("\n── FINAL REGISTRY ─────────────────────────────────")
    registry = build_registry(students)
    registry_json = json.dumps(registry, indent=2, ensure_ascii=False)
    print(registry_json)

    # Save to file
    out_file = OUT_DIR / "student_registry.json"
    out_file.write_text(registry_json, encoding="utf-8")
    print(f"\n[✓] Registry saved to {out_file}")


if __name__ == "__main__":
    main()
