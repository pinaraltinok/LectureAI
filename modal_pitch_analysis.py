import modal
import os
import subprocess
import tempfile
import numpy as np

app = modal.App("lectureai-pitch-surgical")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("librosa", "numpy<2", "google-cloud-storage")
)

def _write_gcp_credentials():
    import os
    from pathlib import Path
    credentials_json = os.getenv("SERVICE_ACCOUNT_JSON") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if credentials_json:
        credentials_path = "/tmp/gcp-service-account.json"
        Path(credentials_path).write_text(credentials_json, encoding="utf-8")
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

def get_pitch(y, sr):
    import librosa
    pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
    valid_pitches = pitches[magnitudes > np.median(magnitudes)]
    if len(valid_pitches) == 0: return 0
    return np.mean(valid_pitches[valid_pitches > 50])

@app.function(image=image, timeout=600, secrets=[modal.Secret.from_name("lectureai-gcp")])
def analyze_pitch_remote(video_blob, ref_audio_blob, start_time, end_time):
    import librosa
    from google.cloud import storage
    
    _write_gcp_credentials()
    client = storage.Client()
    
    # 1. Referans Sesi Al
    ref_bucket = client.bucket("lectureai_student_audios")
    ref_url = ref_bucket.blob(ref_audio_blob).generate_signed_url(version="v4", expiration=600, method="GET")
    
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_ref:
        subprocess.run(["ffmpeg", "-y", "-i", ref_url, "-ar", "16000", "-ac", "1", tmp_ref.name], check=True)
        y_ref, sr_ref = librosa.load(tmp_ref.name, sr=16000)
        ref_pitch = get_pitch(y_ref, sr_ref)

    # 2. Videodan Kesiti Al
    video_bucket = client.bucket("lectureai_full_videos")
    video_url = video_bucket.blob(video_blob).generate_signed_url(version="v4", expiration=600, method="GET")
    
    results = []
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_vid:
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(start_time), "-to", str(end_time),
            "-i", video_url, "-ar", "16000", "-ac", "1", tmp_vid.name
        ], check=True)
        
        y_vid, sr_vid = librosa.load(tmp_vid.name, sr=16000)
        
        # 0.5 saniyelik pencerelerle tara
        win_len = 0.5 
        step = 0.2    
        
        for start in np.arange(0, (float(end_time) - float(start_time)) - win_len, step):
            s_idx = int(start * sr_vid)
            e_idx = int((start + win_len) * sr_vid)
            window = y_vid[s_idx:e_idx]
            
            win_pitch = get_pitch(window, sr_vid)
            diff = abs(win_pitch - ref_pitch)
            
            results.append({
                "time": float(start_time) + start,
                "pitch": float(win_pitch),
                "diff": float(diff)
            })

    return {"ref_pitch": float(ref_pitch), "results": results}

@app.local_entrypoint()
def main(video_blob, ref_audio_blob, start=5385, end=5405):
    data = analyze_pitch_remote.remote(video_blob, ref_audio_blob, start, end)
    print(f"\nRef Pitch (Ali Deniz): {data['ref_pitch']:.2f} Hz")
    print(f"{'ZAMAN':<10} | {'PERDE (Hz)':<12} | {'FARK':<10}")
    print("-" * 40)
    for r in data['results']:
        match = "⭐ MATCH" if r['diff'] < 50 and r['pitch'] > 0 else ""
        print(f"{r['time']:<10.1f} | {r['pitch']:<12.2f} | {r['diff']:<10.2f} {match}")
