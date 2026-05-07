import os
import json
from pathlib import Path
from dotenv import load_dotenv
from google.cloud import storage
import httpx

def test_system_v2():
    load_dotenv()
    print("=== LECTUREAI SISTEM KONTROLU V2 ===\n")
    
    # 1. Google Cloud Kontrolü (Spesifik Bucket)
    print("[1] GCS Bucket Erişimi Kontrol Ediliyor...")
    gcp_key = "gcp-key.json"
    bucket_name = os.getenv("GCS_BUCKET_VIDEOS", "lectureai_full_videos")
    if os.path.exists(gcp_key):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(gcp_key)
        try:
            client = storage.Client()
            bucket = client.bucket(bucket_name)
            # Sadece bucket'ın varlığına bakalım
            if bucket.exists():
                print(f"  [OK] '{bucket_name}' bucket'ına erişim başarılı.")
            else:
                print(f"  [X] '{bucket_name}' bucket'ı bulunamadı.")
        except Exception as e:
            print(f"  [X] GCS Hatası: {e}")
    else:
        print(f"  [X] gcp-key.json bulunamadı.")

    # 2. Gemini API Kontrolü (Doğru Model)
    print("\n[2] Gemini API Kontrol Ediliyor...")
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            # Raporlama scriptinde kullanılan model adını kullanıyoruz
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            payload = {"contents": [{"parts": [{"text": "Sadece 'Merhaba' de."}]}]}
            resp = httpx.post(url, json=payload, timeout=10)
            if resp.status_code == 200:
                print(f"  [OK] Gemini API Başarılı: {resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()}")
            else:
                print(f"  [X] Gemini Hatası ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"  [X] Gemini Bağlantı Hatası: {e}")
    else:
        print("  [X] GEMINI_API_KEY eksik.")

if __name__ == "__main__":
    test_system_v2()
