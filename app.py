from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import os
import json
from pathlib import Path
from unified_pipeline import run_pipeline

app = FastAPI(title="LectureAI Student Report Service")

# Mock Database / Config mapping (Gerçek DB'ye bağlanana kadar)
# Normalde bunları şemadaki tablolardan çekeceğiz
STUDENT_VOICE_MAP = {
    "yaman": "yaman.mp3",
    "mete": "mete.mp3",
    "irem": "irem.mp3"
}

LESSON_VIDEO_MAP = {
    "lesson_101": "Lesson_Records/1777550695949___4.L2_Araba_Olu__turmak.mp4"
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
    # Raporun oluşup oluşmadığını kontrol eden endpoint
    safe_name = student_id.lower().replace(" ", "_")
    # En son oluşturulan PDF'i bulmaya çalış (Basit mantık)
    report_dir = Path("data")
    pdfs = list(report_dir.glob(f"TIMES_NEW_ROMAN_{safe_name}_Rapor_*.pdf"))
    
    if pdfs:
        # En güncel olanı al
        latest_pdf = max(pdfs, key=os.path.getctime)
        return {
            "status": "completed",
            "pdf_url": str(latest_pdf),
            "report_name": latest_pdf.name
        }
    
    return {"status": "processing", "message": "Rapor henüz hazır değil."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
