import os
import json
import time
import subprocess

def check_and_run():
    registry_path = "core/registry_output/student_registry.json"
    print(f"[>>] Mete'nin registry'ye eklenmesi bekleniyor...")
    
    while True:
        if os.path.exists(registry_path):
            try:
                with open(registry_path, "r", encoding="utf-8") as f:
                    reg = json.load(f)
                    
                mete_entry = next((item for item in reg if item["id"] == "Mete"), None)
                if mete_entry and mete_entry.get("voice_confirmed"):
                    print(f"[OK] Mete bulundu: Speaker {mete_entry['speaker_id']}")
                    print("[>>] Rapor olusturuluyor...")
                    
                    # Rapor olusturma komutunu calistir
                    cmd = ["py", "core/generate_student_report.py", "Mete"]
                    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
                    print(result.stdout)
                    if result.stderr:
                        print("Hata:", result.stderr)
                    
                    print("[FINAL] Islem tamamlandi.")
                    break
            except Exception as e:
                print(f"Hata: {e}")
        
        time.sleep(10)

if __name__ == "__main__":
    check_and_run()
