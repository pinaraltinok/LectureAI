import os
import json
import time
import httpx
from google.cloud import storage

# GCS setup
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = (
    r"C:\Users\iremd\Downloads\senior-design-488908-28bd7c55329d.json"
)

ASSEMBLYAI_API_KEY = "26d7fc8d7690420a81e6987a2b3263c0"

def get_signed_url(bucket_name, blob_name):
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    return blob.generate_signed_url(version="v4", expiration=3600, method="GET")

def start_transcription(video_url):
    print(f"[>>] AssemblyAI transkript baslatiliyor (Meeting 2)...")
    headers = {"authorization": ASSEMBLYAI_API_KEY}
    payload = {
        "audio_url": video_url,
        "speaker_labels": True,
        "language_code": "tr",
        "speech_models": ["universal-2"]
    }
    resp = httpx.post("https://api.assemblyai.com/v2/transcript", headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()["id"]

def wait_for_transcription(transcript_id):
    print(f"[>>] Transkript bekleniyor (ID: {transcript_id})...")
    headers = {"authorization": ASSEMBLYAI_API_KEY}
    while True:
        try:
            resp = httpx.get(f"https://api.assemblyai.com/v2/transcript/{transcript_id}", headers=headers, timeout=60)
            data = resp.json()
            status = data["status"]
            if status == "completed":
                print("[OK] Transkript tamamlandi.")
                return data
            elif status == "error":
                raise Exception(f"Transkript hatasi: {data.get('error')}")
            print(f"  ... durum: {status}")
        except httpx.ReadTimeout:
            print("  ... (Zaman asimi, tekrar deneniyor)")
        except Exception as e:
            print(f"  ... (Hata: {e}, tekrar deneniyor)")
            
        time.sleep(15)

if __name__ == "__main__":
    bucket_name = "lectureai_full_videos"
    video_blob = "Lesson_Records/Meeting 2-20260305_131318-Toplantı Kaydı.mp4"
    
    # 1. Signed URL al
    url = get_signed_url(bucket_name, video_blob)
    
    # 2. Transkripti baslat
    tid = start_transcription(url)
    
    # 3. Bekle ve kaydet
    transcript_data = wait_for_transcription(tid)
    
    output_path = "core/registry_output/irem_full_transcript.json"
    os.makedirs("core/registry_output", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
    
    print(f"[FINAL] Transkript kaydedildi: {output_path}")
