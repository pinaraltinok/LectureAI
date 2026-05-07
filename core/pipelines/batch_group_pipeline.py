import os
import sys
import json
from pathlib import Path

# Proje kök dizinini ekle
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.pipelines.unified_pipeline import run_pipeline, get_safe_name

def process_entire_group(video_blob, students):
    """
    Belirli bir video için listedeki tüm öğrenciler için analiz ve raporlama sürecini başlatır.
    """
    print(f"\n{'#'*60}")
    print(f" GRUP ANALIZI BASLATILDI ")
    print(f" Video: {video_blob}")
    print(f" Öğrenci Sayısı: {len(students)}")
    print(f"{'#'*60}\n")

    results = {}
    
    for student_name in students:
        # GCS'deki ses dosyası ismini Türkçe karakterleri temizleyerek üret
        safe_student_id = get_safe_name(student_name).replace("_", "")
        reference_audio_blob = f"{safe_student_id}.mp3"

        
        print(f"\n[STEP] Analiz Ediliyor: {student_name} ({reference_audio_blob})")
        
        try:
            # unified_pipeline'ı her öğrenci için çağır
            run_pipeline(student_name, video_blob, reference_audio_blob)
            results[student_name] = "OK"
        except Exception as e:
            print(f"[!] {student_name} için hata oluştu: {e}")
            results[student_name] = f"ERROR: {str(e)}"

    print(f"\n{'='*50}")
    print(f" TOPLU ISLEM TAMAMLANDI ")
    print(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"{'='*50}\n")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Bir video için tüm gruptaki öğrencileri analiz eder.")
    parser.add_argument("--video", required=True, help="Analiz edilecek video blob adı.")
    parser.add_argument("--students", required=True, help="Virgülle ayrılmış öğrenci listesi (örn: 'Kağan,Ali Deniz,Ömer')")
    
    args = parser.parse_args()
    
    student_list = [s.strip() for s in args.students.split(",")]
    process_entire_group(args.video, student_list)
