import os
import json
import time
import subprocess
from pathlib import Path
from google import genai
import modal
from stream_audio import ensure_video_in_gcs, load_env_file

# Configuration
OUT_DIR = Path("core/registry_output")
TRANSCRIPT_DIR = OUT_DIR
REGISTRY_PATH = OUT_DIR / "student_registry.json"
GEMINI_API_KEY = "AIzaSyAu8-GGkJ80nVuzEYXvF2Bj7idqaI3SJYQ"

def get_safe_name(name):
    return name.lower().replace(" ", "_").replace("i̇", "i")

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
                "py", "speaker_identity_pipeline.py",
                "--video", video_blob,
                "--student", student_name,
                "--reference-blob", reference_audio_blob,
                "--direct-video",
                "--only-transcript"
            ]
            # Not: Bu script bittiğinde transkript dosyası oluşmuş olacak.
            subprocess.run(cmd, check=True, env=env)
            
            if not transcript_path.exists():
                print(f"[-] HATA: Transkript oluşturulamadı.")
                return
        except Exception as e:
            print(f"[-] Transkript hatası: {e}")
            return

    # --- 2. AŞAMA: KONUŞMACI EŞLEŞTİRME (Modal) ---
    speaker_id = None
    if REGISTRY_PATH.exists():
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            registry = json.load(f)
            for entry in registry:
                if entry["id"].lower() == student_name.lower():
                    speaker_id = entry.get("speaker_id")
                    break
    
    if speaker_id:
        print(f"[OK] Konuşmacı ID zaten kayıtlı: Speaker {speaker_id}")
    else:
        print(f"[>>] Konuşmacı eşleşmesi bulunamadı. Modal Speaker Match çalıştırılıyor...")
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
                            # 01 -> A (65 is 'A'), 02 -> B, vb.
                            idx = int(num_match.group())
                            # Not: Genelde 01=A, 02=B olur ama 00 da olabilir.
                            # Eğer 00 ise A, 01 ise B gibi bir kayma olabilir. 
                            # Şimdilik en yaygın eşleşmeyi (01=A veya 00=A) yapıyoruz.
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
                            if entry["id"].lower() == student_name.lower():
                                entry["speaker_id"] = speaker_id
                                entry["voice_notes"] = f"Speaker {speaker_id} (Biometric Match: {match_data.get('score', 0):.2f})"
                                found = True
                                break
                        if not found:
                            registry.append({
                                "id": student_name,
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
            cmd = ["py", "core/generate_student_report.py", student_name, transcript_path]
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
            if result.returncode == 0:
                print(f"[OK] PIPELINE TAMAMLANDI!")
                print(result.stdout)
            else:
                print(f"[-] Rapor Hatası: {result.stderr}")
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
