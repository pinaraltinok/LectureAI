import os
import json
import time
import httpx

ASSEMBLYAI_API_KEY = "26d7fc8d7690420a81e6987a2b3263c0"

def wait_for_transcription(transcript_id):
    print(f"[>>] Transkript bekleniyor (ID: {transcript_id})...")
    headers = {"authorization": ASSEMBLYAI_API_KEY}
    while True:
        try:
            # Timeout süresini artırıyoruz
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
            print("  ... (Zaman asimi hatasi, tekrar deneniyor)")
        except Exception as e:
            print(f"  ... (Hata olustu: {e}, tekrar deneniyor)")
            
        time.sleep(15)

if __name__ == "__main__":
    tid = "ac5ee39a-4988-4337-916f-ca5eec364afa"
    transcript_data = wait_for_transcription(tid)
    
    output_path = "core/registry_output/mete_full_transcript.json"
    os.makedirs("core/registry_output", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(transcript_data, f, ensure_ascii=False, indent=2)
    
    print(f"[FINAL] Transkript kaydedildi: {output_path}")
