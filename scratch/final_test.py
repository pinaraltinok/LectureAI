import os
from dotenv import load_dotenv
from google.cloud import storage
import httpx

def final_test():
    load_dotenv()
    print("=== LECTUREAI FINAL KONTROL ===\n")
    
    # 1. GCS Nesne Listeleme Testi
    print("[1] GCS Nesne Listeleme Test Ediliyor...")
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath("gcp-key.json")
    bucket_name = os.getenv("GCS_BUCKET_VIDEOS", "lectureai_full_videos")
    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blobs = list(bucket.list_blobs(max_results=1))
        print(f"  [OK] GCS Dosya Listeleme Başarılı. İlk dosya: {blobs[0].name if blobs else 'Bucket boş'}")
    except Exception as e:
        print(f"  [X] GCS Hatası: {e}")

    # 2. Gemini Raporlama Modeli Testi
    print("\n[2] Gemini Raporlama Modeli Test Ediliyor...")
    gemini_key = os.getenv("GEMINI_API_KEY")
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={gemini_key}"
        payload = {"contents": [{"parts": [{"text": "Sadece 'Tamam' de."}]}]}
        resp = httpx.post(url, json=payload, timeout=10)
        if resp.status_code == 200:
            print(f"  [OK] Gemini Yanıtı: {resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()}")
        else:
            print(f"  [X] Gemini Hatası: {resp.status_code}")
    except Exception as e:
        print(f"  [X] Gemini Hatası: {e}")

if __name__ == "__main__":
    final_test()
