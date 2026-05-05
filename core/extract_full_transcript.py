"""
Phase 2: Full Course Transcription
This script extracts the FULL audio from the lecture, sends it to AssemblyAI for 
diarization, and stores the raw transcript mapping.
"""
import sys
import json
import time
import subprocess
from pathlib import Path
import httpx

try:
    import imageio_ffmpeg
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    ffmpeg_bin = "ffmpeg"

OUT_DIR = Path("registry_output")
VIDEO_PATH = OUT_DIR / "TURPRM40W273_TUE-1930_8-9(L0).mp4"
FULL_AUDIO_PATH = OUT_DIR / "full_audio.mp3"
TRANSCRIPT_PATH = OUT_DIR / "full_transcript.json"

def extract_audio():
    if FULL_AUDIO_PATH.exists():
        print(f"[OK] Full audio already extracted: {FULL_AUDIO_PATH}")
        return
    print("[>>] Extracting full 1-hour audio via ffmpeg...")
    subprocess.run([
        ffmpeg_bin, "-y",
        "-i", str(VIDEO_PATH),
        "-vn", 
        "-acodec", "libmp3lame",
        "-ar", "16000",       
        "-ac", "1",           
        str(FULL_AUDIO_PATH),
    ], check=True)
    print(f"[OK] Full audio saved.")

def diarize_audio():
    if TRANSCRIPT_PATH.exists():
        print(f"[OK] Full transcript already exists: {TRANSCRIPT_PATH}")
        return

    ASSEMBLYAI_KEY = "26d7fc8d7690420a81e6987a2b3263c0"
    HEADERS = {"authorization": ASSEMBLYAI_KEY}
    BASE = "https://api.assemblyai.com/v2"

    print("[>>] Uploading full audio to AssemblyAI (this will take a while)...")
    with open(FULL_AUDIO_PATH, "rb") as f:
        resp = httpx.post(f"{BASE}/upload", headers=HEADERS, content=f, timeout=300)
    resp.raise_for_status()
    upload_url = resp.json()["upload_url"]

    print("[>>] Requesting full diarization transcript...")
    body = {
        "audio_url": upload_url,
        "speaker_labels": True,
        "language_detection": True,
        "speech_models": ["universal-2"],
    }
    resp = httpx.post(f"{BASE}/transcript", headers=HEADERS, json=body, timeout=30)
    resp.raise_for_status()
    transcript_id = resp.json()["id"]

    print("[>>] Waiting for AssemblyAI to finish processing the 1-hour video...")
    while True:
        resp = httpx.get(f"{BASE}/transcript/{transcript_id}", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        status = data["status"]
        if status == "completed":
            break
        elif status == "error":
            print(f"[!!] Transcription failed: {data.get('error')}")
            sys.exit(1)
        print(f"  ... status: {status}")
        time.sleep(10)

    with open(TRANSCRIPT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[OK] Full transcript saved to {TRANSCRIPT_PATH}")

if __name__ == "__main__":
    if not VIDEO_PATH.exists():
        print("[!] Download the video first using student_registry_builder.py")
        sys.exit(1)
    extract_audio()
    diarize_audio()
