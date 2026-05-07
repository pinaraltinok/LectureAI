import json
import os
import subprocess
import tempfile
import numpy as np
from pathlib import Path

# NOT: Bu script Modal üzerinde çalışacak şekilde tasarlandı 
# çünkü GPU ve ECAPA-TDNN modeline ihtiyaç duyar.

import modal

app = modal.App("lectureai-high-res-scan")

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
        "librosa",
    )
)

@app.function(image=image, gpu="T4", timeout=1800, secrets=[modal.Secret.from_name("lectureai-gcp")])
def scan_video_for_student(video_blob, ref_audio_url, transcript_json_path):
    import torch
    import torchaudio
    from speechbrain.inference.speaker import EncoderClassifier
    from google.cloud import storage

    # 1. Modeli Yükle (ECAPA-TDNN - Dünyanın en iyi biyometrik modellerinden biri)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    classifier = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        run_opts={"device": device}
    )

    # 2. Referans Sesi Al ve Embedding Çıkar
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_ref:
        subprocess.run(["ffmpeg", "-y", "-i", ref_audio_url, "-ar", "16000", "-ac", "1", tmp_ref.name], check=True)
        ref_signal, fs = torchaudio.load(tmp_ref.name)
        ref_emb = classifier.encode_batch(ref_signal).squeeze().cpu().numpy()

    # 3. Transkripti Oku
    with open(transcript_json_path, "r", encoding="utf-8") as f:
        transcript = json.load(f)
    utterances = transcript.get("utterances", [])

    # 4. Video Sesini Al
    client = storage.Client()
    bucket = client.bucket("lectureai_full_videos")
    blob = bucket.blob(video_blob)
    signed_url = blob.generate_signed_url(version="v4", expiration=3600, method="GET")

    # 5. HER BİR CÜMLEYİ TEK TEK TARAYALIM
    matches = []
    print(f"[SCAN] {len(utterances)} cümle taranıyor...")
    
    # Tüm videonun sesini indir (parça parça kesmek için)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as full_audio:
        subprocess.run(["ffmpeg", "-y", "-i", signed_url, "-ar", "16000", "-ac", "1", full_audio.name], check=True)
        video_signal, fs = torchaudio.load(full_audio.name)

    for i, utt in enumerate(utterances):
        start_samp = int((utt["start"] / 1000.0) * fs)
        end_samp = int((utt["end"] / 1000.0) * fs)
        
        # Çok kısa sesleri atla (gürültü olabilir)
        if (end_samp - start_samp) < 8000: # 0.5 sn
            continue
            
        seg = video_signal[:, start_samp:end_samp]
        seg_emb = classifier.encode_batch(seg).squeeze().cpu().numpy()
        
        # Cosine Similarity
        score = np.dot(ref_emb, seg_emb) / (np.linalg.norm(ref_emb) * np.linalg.norm(seg_emb))
        
        if score > 0.35: # Eşik değerini düşük tutalım ki hepsini görelim, sonra en iyileri seçeriz
            matches.append({
                "index": i,
                "text": utt["text"],
                "score": float(score),
                "speaker": utt["speaker"],
                "start": utt["start"]/1000.0
            })

    # En yüksek skorlu 10 eşleşmeyi döndür
    top_matches = sorted(matches, key=lambda x: x["score"], reverse=True)[:20]
    return top_matches

@app.local_entrypoint()
def main(video_blob, ref_audio_blob, transcript_path):
    # Transkripti okuyup doğrudan gönderelim
    with open(transcript_path, "r", encoding="utf-8") as f:
        transcript_data = json.load(f)

    print(f"[LOCAL] Tarama başlatılıyor: {video_blob} (Ref: {ref_audio_blob})")
    
    # Modal fonksiyonunu çağır
    results = scan_video_for_student_optimized.remote(video_blob, ref_audio_blob, transcript_data)
    
    print("\n" + "="*60)
    print(f"🎯 BİYOMETRİK EŞLEŞME SONUÇLARI (Ali Deniz)")
    print("="*60)
    for res in results:
        print(f"Puan: {res['score']:.4f} | Zaman: {res['start']:.2f}s | Speaker: {res['speaker']} | Metin: {res['text']}")
    print("="*60 + "\n")

def _write_gcp_credentials():
    import os
    from pathlib import Path
    credentials_json = (
        os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
        or os.getenv("SERVICE_ACCOUNT_JSON")
    )
    if not credentials_json:
        return

    credentials_path = "/tmp/gcp-service-account.json"
    Path(credentials_path).write_text(credentials_json, encoding="utf-8")
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

@app.function(image=image, gpu="T4", timeout=1800, secrets=[modal.Secret.from_name("lectureai-gcp")])
def scan_video_for_student_optimized(video_blob, ref_audio_blob, transcript_data):
    import torch
    import torchaudio
    from speechbrain.inference.speaker import EncoderClassifier
    from google.cloud import storage
    import io
    import os

    _write_gcp_credentials()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    classifier = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        run_opts={"device": device}
    )

    # 2. GCS İstemcisi
    client = storage.Client()
    
    # 3. Referans Sesi GCS'den Al
    ref_bucket = client.bucket("lectureai_student_audios")
    ref_blob = ref_bucket.blob(ref_audio_blob)
    ref_signed_url = ref_blob.generate_signed_url(version="v4", expiration=3600, method="GET")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_ref:
        subprocess.run(["ffmpeg", "-y", "-i", ref_signed_url, "-ar", "16000", "-ac", "1", tmp_ref.name], check=True)
        ref_signal, fs = torchaudio.load(tmp_ref.name)
        ref_emb = classifier.encode_batch(ref_signal).squeeze().cpu().numpy()

    # 4. Transkript Verisi
    utterances = transcript_data.get("utterances", [])

    # 5. Video Sesini Al
    video_bucket = client.bucket("lectureai_full_videos")
    video_blob_obj = video_bucket.blob(video_blob)
    video_signed_url = video_blob_obj.generate_signed_url(version="v4", expiration=3600, method="GET")

    # 6. Video Sesini İndir ve İncele
    matches = []
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as full_audio:
        print("[MODAL] Video sesi indiriliyor...")
        subprocess.run(["ffmpeg", "-y", "-i", video_signed_url, "-ar", "16000", "-ac", "1", full_audio.name], check=True)
        video_signal, fs = torchaudio.load(full_audio.name)

    print(f"[MODAL] {len(utterances)} cümle tek tek biyometrik teste giriyor...")
    for i, utt in enumerate(utterances):
        start_samp = int((utt["start"] / 1000.0) * fs)
        end_samp = int((utt["end"] / 1000.0) * fs)
        
        if (end_samp - start_samp) < 8000: # 0.5 sn'den kısa sesler güvenilmezdir
            continue
            
        seg = video_signal[:, start_samp:end_samp]
        seg_emb = classifier.encode_batch(seg).squeeze().cpu().numpy()
        
        # Cosine Similarity (Vektörel Benzerlik)
        score = np.dot(ref_emb, seg_emb) / (np.linalg.norm(ref_emb) * np.linalg.norm(seg_emb))
        
        if score > 0.25: # Eşik değerini düşük tutalım ki hepsini görelim
            matches.append({
                "text": utt["text"],
                "score": float(score),
                "speaker": utt["speaker"],
                "start": utt["start"]/1000.0
            })

    # En yüksek skorlu 20 eşleşmeyi döndür
    return sorted(matches, key=lambda x: x["score"], reverse=True)[:20]
