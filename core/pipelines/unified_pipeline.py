import os
import json
import time
import subprocess
import sys
from pathlib import Path

# UTF-8 Desteği
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass
from google import genai
import modal
import sys
from pathlib import Path

# Proje kök dizinini ekle
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.stream_audio import ensure_video_in_gcs, load_env_file

# Configuration
OUT_DIR = Path("core/storage")
TRANSCRIPT_DIR = OUT_DIR
REGISTRY_PATH = OUT_DIR / "student_registry.json"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def get_safe_name(value):
    safe = value.strip().lower().replace(" ", "_")
    replacements = {
        "ı": "i", "İ": "i", "ö": "o", "Ö": "o", "ü": "u", "Ü": "u",
        "ç": "c", "Ç": "c", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g",
    }
    for src, dst in replacements.items():
        safe = safe.replace(src, dst)
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in safe)

def run_pipeline(student_name, video_blob, reference_audio_blob):
    print(f"\n{'='*50}")
    print(f"PIPELINE BASLATILDI: {student_name} | {video_blob}")
    print(f"{'='*50}\n")

    # --- AYARLARI YÜKLE ---
    load_env_file()
    if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    # --- 0. AŞAMA: GCS KONTROL & YÜKLEME ---
    try:
        video_blob = ensure_video_in_gcs(video_blob)
    except Exception as e:
        print(f"[-] Video hazırlama hatası: {e}")
        return

    # --- 1. AŞAMA: TRANSKRİPT KONTROLÜ (AssemblyAI) ---
    video_stem = Path(video_blob).stem
    transcript_filename = f"{get_safe_name(video_stem)}_full_transcript.json"
    transcript_path = TRANSCRIPT_DIR / transcript_filename

    if transcript_path.exists():
        print(f"[OK] Transkript zaten mevcut: {transcript_path}")
    else:
        print(f"[>>] Transkript bulunamadı. AssemblyAI tetikleniyor...")
        try:
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            # speaker_identity_pipeline'ı sadece transkript üretmesi için çağıralım
            # --direct-video flag'i GCS'den okumasını sağlar
            cmd = [
                sys.executable, "speaker_identity_pipeline.py",
                "--video", video_blob,
                "--student", student_name,
                "--reference-blob", reference_audio_blob,
                "--direct-video",
                "--only-transcript"
            ]
            # Not: Bu script bittiğinde transkript dosyası oluşmuş olacak.
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", env=env)
            
            if result.returncode != 0:
                print(f"[-] Transkript hatası (stdout): {result.stdout}")
                print(f"[-] Transkript hatası (stderr): {result.stderr}")
                return

            print(f"[DEBUG] Aranan transkript yolu: {transcript_path}")
            if not transcript_path.exists():
                print(f"[-] HATA: Transkript oluşturulamadı (Dosya bulunamadı).")
                return
        except Exception as e:
            print(f"[-] Beklenmeyen transkript hatası: {e}")
            return

    # --- 2. AŞAMA: KONUŞMACI EŞLEŞTİRME (Modal) ---
    speaker_id = None
    
    # Registry kontrolü (Video Bazlı Cache fallback)
    # Sadece AYNI VİDEO ve AYNI ÖĞRENCİ ise cache kullan
    if REGISTRY_PATH.exists():
        try:
            with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                registry = json.load(f)
            for entry in registry:
                # Video yolu ve öğrenci ismi eşleşmeli
                if entry.get("video_path") == video_blob and entry["id"].lower() == student_name.lower():
                    speaker_id = entry.get("speaker_id")
                    print(f"[OK] Bu video için {student_name} verisi zaten mevcut: Speaker {speaker_id}")
                    break
        except Exception as e:
            print(f"[-] Registry okuma hatası: {e}")

    if not speaker_id:
        print(f"[>>] Yeni biyometrik tarama başlatılıyor. Modal Speaker Match çalıştırılıyor...")
        try:
            # Windows encoding hatasını önlemek için env ekleyelim
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            
            cmd = [
                "modal", "run", "modal_speaker_match.py",
                "--video-blob", video_blob,
                "--student-audio-blob", reference_audio_blob,
                "--student", student_name,
                "--max-minutes", "100"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", env=env)
            
            if result.returncode == 0:
                print(f"[OK] Modal eşleşme tamamlandı.")
                # Modal çıktısından JSON'ı bul (Bazen loglar arasında olabilir)
                try:
                    import re
                    json_match = re.search(r'\{.*\}', result.stdout, re.DOTALL)
                    if json_match:
                        match_data = json.loads(json_match.group())
                        raw_speaker = match_data.get("best_speaker", "")
                        
                        # SPEAKER_01 -> A, SPEAKER_02 -> B çevirisi
                        import re
                        num_match = re.search(r'\d+', raw_speaker)
                        if num_match:
                            idx = int(num_match.group())
                            speaker_id = chr(64 + idx) if idx > 0 else "A"
                        else:
                            speaker_id = raw_speaker
                        
                        # Yerel registry'i güncelle
                        registry = []
                        if REGISTRY_PATH.exists():
                            with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                                registry = json.load(f)
                        
                        # Varsa güncelle yoksa ekle
                        found = False
                        for entry in registry:
                            if entry["id"].lower() == student_name.lower() and entry.get("video_path") == video_blob:
                                entry["speaker_id"] = speaker_id
                                entry["voice_notes"] = f"Speaker {speaker_id} (Biometric Match: {match_data.get('score', 0):.2f})"
                                found = True
                                break
                        if not found:
                            registry.append({
                                "id": student_name,
                                "video_path": video_blob,
                                "speaker_id": speaker_id,
                                "is_student": True,
                                "voice_notes": f"Speaker {speaker_id} (Biometric Match: {match_data.get('score', 0):.2f})",
                                "voice_confirmed": True,
                                "detection_method": "modal_biometric_match"
                            })
                        
                        with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
                            json.dump(registry, f, ensure_ascii=False, indent=2)
                        print(f"[OK] Registry güncellendi: {student_name} -> Speaker {speaker_id}")
                    else:
                        print("[-] Modal çıktısında JSON verisi bulunamadı.")
                except Exception as e:
                    print(f"[-] Çıktı işleme hatası: {e}")
            else:
                print(f"[-] Modal Hatası: {result.stderr}")
                return
        except Exception as e:
            print(f"[-] Modal çağrısı başarısız: {e}")
            return

    # --- 3. AŞAMA: RAPOR ÜRETİMİ (Gemini & PDF) ---
    if speaker_id:
        print(f"[>>] Rapor oluşturma aşamasına geçiliyor...")
        try:
            # Windows encoding hatasını önlemek için env
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            
            transcript_path = os.path.join(OUT_DIR, transcript_filename)
            cmd = [sys.executable, "core/reporting/generate_student_report.py", student_name, transcript_path]
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
            if result.returncode == 0:
                print(f"[OK] PIPELINE TAMAMLANDI!")
                print(result.stdout)
            else:
                print(f"[-] Rapor Hatası (stdout): {result.stdout}")
                print(f"[-] Rapor Hatası (stderr): {result.stderr}")
        except Exception as e:
            print(f"[-] Rapor oluşturma başarısız: {e}")
    else:
        print("[-] HATA: Speaker ID belirlenemediği için rapor oluşturulamadı.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--student", default="Yaman")
    parser.add_argument("--video", default="Lesson_Records/1777550695949___4.L2_Araba_Olu__turmak.mp4")
    parser.add_argument("--reference", default="yaman.mp3")
    args = parser.parse_args()

    run_pipeline(args.student, args.video, args.reference)
