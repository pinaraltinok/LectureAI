import os
import json
from pathlib import Path
from dotenv import load_dotenv
from google.cloud import storage
import modal
import httpx

def test_system():
    load_dotenv()
    print("=== LECTUREAI SISTEM KONTROLU ===\n")
    
    # 1. Google Cloud Kontrolü
    print("[1] Google Cloud Storage Kontrol Ediliyor...")
    # Yerelde çalıştığımız için dosya yolunu düzeltiyoruz
    gcp_key = "gcp-key.json"
    if os.path.exists(gcp_key):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(gcp_key)
        try:
            client = storage.Client()
            buckets = list(client.list_buckets(max_results=1))
            print(f"  [OK] GCS Bağlantısı Başarılı. (Project: {client.project})")
        except Exception as e:
            print(f"  [X] GCS Hatası: {e}")
    else:
        print(f"  [X] gcp-key.json dosyası bulunamadı!")

    # 2. Modal Kontrolü
    print("\n[2] Modal Bağlantısı Kontrol Ediliyor...")
    token_id = os.getenv("MODAL_TOKEN_ID")
    if token_id:
        print(f"  [OK] Modal Token ID Tanımlı: {token_id[:10]}...")
        # Modal auth testi (basit bir ping)
        try:
            # Modal client kontrolü
            client = modal.Client.from_env()
            print("  [OK] Modal Yetkilendirme Başarılı.")
        except Exception as e:
            print(f"  [X] Modal Bağlantı Hatası: {e}")
    else:
        print("  [X] MODAL_TOKEN_ID .env dosyasında bulunamadı!")

    # 3. Gemini API Kontrolü
    print("\n[3] Gemini API Kontrol Ediliyor...")
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={gemini_key}"
            resp = httpx.post(url, json={"contents": [{"parts": [{"text": "ping"}]}]}, timeout=10)
            if resp.status_code == 200:
                print("  [OK] Gemini API Erişilebilir.")
            else:
                print(f"  [X] Gemini Hatası: {resp.status_code}")
        except Exception as e:
            print(f"  [X] Gemini Bağlantı Hatası: {e}")
    else:
        print("  [X] GEMINI_API_KEY .env dosyasında bulunamadı!")

if __name__ == "__main__":
    test_system()
