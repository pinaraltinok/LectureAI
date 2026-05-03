import os
import json
import subprocess
import tempfile
import numpy as np
import modal

# Ali Deniz'i Nusret ve Öğretmen'den ayırmak için 
# milisaniyelik tarama yapan özel "Cerrahi" Biyometrik Tarayıcı

app = modal.App("lectureai-surgical-scan")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "google-cloud-storage==2.19.0",
        "numpy<2",
        "torch==2.4.1",
        "torchaudio==2.4.1",
        "speechbrain==1.0.1",
        "huggingface_hub==0.23.2",
    )
)

def _write_gcp_credentials():
    import os
    from pathlib import Path
    credentials_json = os.getenv("SERVICE_ACCOUNT_JSON") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if credentials_json:
        credentials_path = "/tmp/gcp-service-account.json"
        Path(credentials_path).write_text(credentials_json, encoding="utf-8")
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

@app.function(image=image, gpu="T4", timeout=600, secrets=[modal.Secret.from_name("lectureai-gcp")])
def surgical_biometric_scan(video_blob, ref_audio_blob, start_time, end_time):
    import torch
    import torchaudio
    from speechbrain.inference.speaker import EncoderClassifier
    from google.cloud import storage

    _write_gcp_credentials()
    
    # Parametreleri sayıya çevir
    start_time = float(start_time)
    end_time = float(end_time)
    
    # 1. Modeli Yükle (ECAPA-TDNN)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    classifier = EncoderClassifier.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb", run_opts={"device": device})

    # 2. Ali Deniz Referans Sesi
    client = storage.Client()
    ref_bucket = client.bucket("lectureai_student_audios")
    ref_blob = ref_bucket.blob(ref_audio_blob)
    ref_url = ref_blob.generate_signed_url(version="v4", expiration=600, method="GET")

    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_ref:
        subprocess.run(["ffmpeg", "-y", "-i", ref_url, "-ar", "16000", "-ac", "1", tmp_ref.name], check=True)
        ref_signal, fs = torchaudio.load(tmp_ref.name)
        ref_emb = classifier.encode_batch(ref_signal).squeeze().cpu().numpy()

    # 3. Videodaki Sorunlu Bölgeyi Al (Örn: 5390s - 5400s)
    video_bucket = client.bucket("lectureai_full_videos")
    video_blob_obj = video_bucket.blob(video_blob)
    video_url = video_blob_obj.generate_signed_url(version="v4", expiration=600, method="GET")

    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_vid:
        print(f"[SURGICAL] {start_time}s - {end_time}s arası kesiliyor...")
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(start_time), "-to", str(end_time), 
            "-i", video_url, "-ar", "16000", "-ac", "1", tmp_vid.name
        ], check=True)
        
        # Bu 10 saniyelik parçayı 0.5 saniyelik pencerelerle tara (Sliding Window)
        video_signal, fs = torchaudio.load(tmp_vid.name)
        window_size = int(0.5 * fs) # 0.5 saniye
        step_size = int(0.2 * fs)   # 0.2 saniye kaydır (yüksek hassasiyet)
        
        results = []
        for start in range(0, video_signal.shape[1] - window_size, step_size):
            window = video_signal[:, start : start + window_size]
            win_emb = classifier.encode_batch(window).squeeze().cpu().numpy()
            
            # Benzerlik Skoru
            score = np.dot(ref_emb, win_emb) / (np.linalg.norm(ref_emb) * np.linalg.norm(win_emb))
            results.append({
                "time": start_time + (start / fs),
                "score": float(score)
            })

    return results

@app.local_entrypoint()
def main(video_blob, ref_audio_blob, start=5385, end=5400):
    print(f"[LOCAL] {start}s - {end}s arası cerrahi biyometrik tarama yapılıyor...")
    results = surgical_biometric_scan.remote(video_blob, ref_audio_blob, start, end)
    
    print("\n🎯 MİKRO-BİYOMETRİK SONUÇLAR (Ali Deniz Eşleşmesi)")
    print("="*50)
    for res in results:
        star = "⭐" if res['score'] > 0.45 else "  "
        print(f"{res['time']:.2f}s | Skor: {res['score']:.4f} {star}")
    print("="*50)
