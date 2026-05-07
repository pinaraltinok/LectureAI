import os
import sys
import json
import base64
from pathlib import Path
from fastapi import FastAPI, Request, Response
import uvicorn

# Proje kök dizinini ekle
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.pipelines.unified_pipeline import run_pipeline
from core.pipelines.batch_group_pipeline import process_entire_group

app = FastAPI()

@app.get("/")
async def health_check():
    return {"status": "worker is healthy"}

@app.post("/")
async def pubsub_push_handler(request: Request):
    """
    Pub/Sub Push üzerinden gelen mesajları yakalar.
    Push modunda ack = HTTP 2xx döndürmek. message.ack() KULLANILMAZ.
    """
    try:
        envelope = await request.json()
        if not envelope or "message" not in envelope:
            return Response(content="Bad Request: No message", status_code=400)
        
        message = envelope["message"]
        data_raw = message.get("data")
        if not data_raw:
            return Response(content="Bad Request: No data", status_code=400)

        decoded_data = base64.b64decode(data_raw).decode("utf-8")
        data = json.loads(decoded_data)
        
        video_id = data.get("video_id")
        video_uri = data.get("video_uri")
        
        if not video_id:
            return Response(content="Bad Request: No video_id", status_code=400)
        
        print(f"\n[Push] Analiz istegi: {video_id}")
        
        # Video yolu belirleme
        video_blob = None
        if video_uri:
            if video_uri.startswith("gs://"):
                video_blob = "/".join(video_uri.split("/")[3:])
        
        if not video_blob:
            video_blob = f"Lesson_Records/{video_id}.mp4"

        # --- ÖĞRENCİ LİSTESİ: Mesajdan al, hardcoded listeye düşme ---
        students_from_msg = data.get("students")       # ["Ali", "Veli", ...]
        student_name = data.get("student_name")         # Tek isim

        if students_from_msg and isinstance(students_from_msg, list):
            # Mesajda liste geldiyse onu kullan
            students = students_from_msg
            print(f"[OK] Mesajdan {len(students)} ogrenci alindi: {students}")
        elif student_name:
            # Mesajda tek isim geldiyse sadece onu işle
            students = [student_name]
            print(f"[OK] Mesajdan tek ogrenci alindi: {student_name}")
        else:
            # Hiçbir öğrenci belirtilmemişse hata ver, herkesi çalıştırma
            print("[-] Mesajda ogrenci bilgisi yok! Islem yapilmiyor.")
            return Response(content="Bad Request: No student info", status_code=400)

        # Pipeline'ı çalıştır
        print(f"[OK] {len(students)} ogrenci icin analiz basliyor...")
        process_entire_group(video_blob, students)
        
        print(f"[OK] {video_id} icin islem tamamlandi.")
        
        # HTTP 204 = mesaj onaylandi (ack). message.ack() ÇAĞIRILMAZ.
        return Response(status_code=204)
    except Exception as e:
        print(f"[-] Hata: {e}")
        import traceback
        traceback.print_exc()
        return Response(content=str(e), status_code=500)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
