from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import os
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

# Proje kök dizinini ekle
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.pipelines.unified_pipeline import run_pipeline

app = FastAPI(title="LectureAI Student Report Service")

# Global bir sözlük ile her isteğin başlama zamanını tutalım
report_requests = {}

# Mock Database / Config mapping (Gerçek DB'ye bağlanana kadar)
# Normalde bunları şemadaki tablolardan çekeceğiz
STUDENT_VOICE_MAP = {
    "yaman": "yaman.mp3",
    "mete": "mete.mp3",
    "irem": "irem.mp3",
    "kağan efe tezcan": "kaganefetezcan.mp3",
    "kagan efe tezcan": "kaganefetezcan.mp3"
}

LESSON_VIDEO_MAP = {
    "lesson_101": "Lesson_Records/1777550695949___4.L2_Araba_Olu__turmak.mp4",
    "python_pro_10": "videos/videos/[1619]Python Pro[None][13-17][90 min][40 L][Turkey][in progress]/Kübra Gezici/TUR40W292_THU-20_10-12/М3L1_Flask-Sanal ortamı yapılandırma.mp4"
}

class ReportRequest(BaseModel):
    student_id: str
    lesson_id: str

@app.get("/")
async def root():
    return {"message": "LectureAI Report Service is Running"}

@app.post("/generate-student-report")
async def generate_student_report(request: ReportRequest, background_tasks: BackgroundTasks):
    student_key = request.student_id.lower()
    lesson_key = request.lesson_id.lower()

    # 1. Kontroller
    if student_key not in STUDENT_VOICE_MAP:
        raise HTTPException(status_code=404, detail="Öğrenci referans sesi bulunamadı.")
    
    if lesson_key not in LESSON_VIDEO_MAP:
        raise HTTPException(status_code=404, detail="Ders videosu bulunamadı.")

    video_path = LESSON_VIDEO_MAP[lesson_key]
    reference_voice = STUDENT_VOICE_MAP[student_key]

    # 2. Pipeline'ı Arka Planda Çalıştır (Frontend'i bekletmemek için)
    # Gerçek uygulamada 'processing' statüsü dönüp, frontend'in polling yapması sağlanır.
    print(f"[API] {request.student_id} için {request.lesson_id} raporu başlatılıyor...")
    
    # İstek zamanını kaydet (UTC)
    report_requests[f"{student_key}_{lesson_key}"] = datetime.now(timezone.utc)
    
    # Arka planda çalıştırıyoruz çünkü işlem 1-2 dakika sürebilir
    background_tasks.add_task(
        run_pipeline, 
        student_name=request.student_id, 
        video_blob=video_path, 
        reference_audio_blob=reference_voice
    )

    return {
        "status": "processing",
        "student": request.student_id,
        "lesson": request.lesson_id,
        "message": "Rapor oluşturma işlemi başlatıldı. Lütfen birkaç dakika bekleyin."
    }

@app.get("/check-report/{student_id}/{lesson_id}")
async def check_report(student_id: str, lesson_id: str):
    # Raporun GCS üzerinde olup olmadığını kontrol et
    # (Basitlik için GCS URL'sini tahmin ediyoruz, gerçekte bucket.blob.exists() bakılabilir)
    safe_name = student_id.lower().replace("ö", "o").replace("ü", "u").replace("ç", "c").replace("ş", "s").replace("ı", "i").replace("ğ", "g").replace(" ", "_")
    bucket_name = os.getenv("GCS_BUCKET_REPORTS", "lectureai_student_reports")
    
    # Not: PDF ismi timestamp içerdiği için tam ismi bulmak için GCS listeleme gerekebilir.
    # Şimdilik en pratik yol: Rapor tamamlandığında registry'e veya bir loga yazmak.
    # Ancak en hızlı çözüm: GCS'de ilgili klasörü listele
    try:
        from google.cloud import storage
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        
        # 'pdf/' klasöründeki bu öğrenciye ait dosyaları listele
        blobs = list(storage_client.list_blobs(bucket, prefix=f"pdf/TIMES_NEW_ROMAN_{safe_name}"))
        
        if blobs:
            # En güncel olanı bul (updated zamanına göre)
            latest_blob = max(blobs, key=lambda b: b.updated)
            
            # ZAMAN KONTROLÜ: Eğer bu dosya bizim isteğimizden ÖNCE üretilmişse, görmezden gel
            req_time = report_requests.get(f"{student_id.lower()}_{lesson_id.lower()}")
            if req_time and latest_blob.updated < req_time:
                return {"status": "processing", "message": "Yeni rapor hazırlanıyor, lütfen bekleyin..."}

            # Public URL veya Authenticated URL (Burada projenize göre link yapısı verilir)
            gcs_url = f"https://storage.googleapis.com/{bucket_name}/{latest_blob.name}"
            
            return {
                "status": "completed",
                "pdf_url": gcs_url,
                "report_name": latest_blob.name,
                "updated": latest_blob.updated
            }
    except Exception as e:
        print(f"[-] GCS Kontrol Hatası: {e}")
    
    return {"status": "processing", "message": "Rapor henüz hazır değil veya buluta yükleniyor."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
