import modal
import os
import subprocess
import tempfile
import numpy as np

app = modal.App("lectureai-who-said-quiz")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("librosa", "numpy<2", "google-cloud-storage", "speechbrain")
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
def compare_voices_internal(video_blob, ali_deniz_start, teacher_start, quiz_start):
    import torch
    import torchaudio
    from speechbrain.inference.speaker import EncoderClassifier
    from google.cloud import storage
    import librosa

    _write_gcp_credentials()
    client = storage.Client()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    classifier = EncoderClassifier.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb", run_opts={"device": device})

    vid_url = client.bucket("lectureai_full_videos").blob(video_blob).generate_signed_url(version="v4", expiration=600, method="GET")

    def get_emb_internal(ss, to):
        with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
            subprocess.run([
                "ffmpeg", "-y", "-ss", str(ss), "-to", str(to),
                "-i", vid_url, "-ar", "16000", "-ac", "1", tmp.name
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            sig, sr = librosa.load(tmp.name, sr=16000)
            sig_tensor = torch.tensor(sig).unsqueeze(0)
            return classifier.encode_batch(sig_tensor).squeeze().cpu().numpy()

    # 1. Ali Deniz Referansı (Kesin: 5470s)
    ali_emb = get_emb_internal(ali_deniz_start, ali_deniz_start + 3)

    # 2. Öğretmen Referansı (Kesin: 3325s)
    teacher_emb = get_emb_internal(teacher_start, teacher_start + 3)

    # 3. "Quiz" Kesiti (Tartışmalı: 5392s)
    quiz_emb = get_emb_internal(quiz_start, quiz_start + 2)

    def sim(a, b):
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

    return {
        "ali_deniz_sim": float(sim(ali_emb, quiz_emb)),
        "teacher_sim": float(sim(teacher_emb, quiz_emb))
    }

@app.local_entrypoint()
def main():
    video = "Lesson_Records/1777550695949___4.L2_Araba_Olu__turmak.mp4"
    results = compare_voices_internal.remote(video, 5470, 3325, 5392)
    
    print("\n🕵️ 'QUIZ' KELİMESİ KİME AİT? (VİDEO İÇİ BİYOMETRİK ANALİZ)")
    print("="*60)
    print(f"ALİ DENİZ (5470s) ile Benzerlik : %{results['ali_deniz_sim']*100:.2f}")
    print(f"ÖĞRETMEN  (3325s) ile Benzerlik : %{results['teacher_sim']*100:.2f}")
    print("="*60)
    
    if results['ali_deniz_sim'] > results['teacher_sim']:
        print("🎯 SONUÇ: 'Quiz' kelimesi ALİ DENİZ'e ait! (Senin duyduğun doğru!)")
    else:
        print("🎯 SONUÇ: 'Quiz' kelimesi ÖĞRETMEN'e ait!")
