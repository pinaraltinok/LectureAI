import os
import json
from pathlib import Path
from google import genai
from google.genai import types

# API KEY
GEMINI_API_KEY = "AIzaSyAu8-GGkJ80nVuzEYXvF2Bj7idqaI3SJYQ"

def identify_student_with_gemini(video_blob_name, student_audio_blob_name):
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    video_uri = f"gs://lectureai_full_videos/{video_blob_name}"
    audio_uri = f"gs://lectureai_student_audios/{student_audio_blob_name}"

    print(f"[GEMINI] Analiz başlatılıyor...")
    print(f"Video: {video_uri}")
    print(f"Öğrenci Sesi: {audio_uri}")

    prompt = """
    Sana iki tane ses/video dosyası veriyorum.
    1. 'Öğrenci Sesi': Bu, Ali Deniz isimli öğrencinin referans ses kaydıdır.
    2. 'Ders Videosu': Bu, içinde birden fazla öğrenci ve bir öğretmenin bulunduğu ders videosudur.
    
    Görevin:
    - Öğrenci Sesi'ndeki tonu, enerjiyi, ses rengini ve biyometrik karakteri iyice analiz et.
    - Ders Videosu'nu baştan sona dinle ve bu sesin SAHİBİNİN konuştuğu her saniyeyi bul.
    - Sadece Ali Deniz'in konuştuğu cümleleri ve saniyeleri (Start-End) listele.
    - Eğer emin değilsen belirtme. Sadece %100 emin olduğun anları yaz.
    
    Çıktıyı şu JSON formatında ver:
    {
      "student": "Ali Deniz",
      "matches": [
        {"start": "SS:DD", "end": "SS:DD", "text": "...", "confidence": 0.95},
        ...
      ]
    }
    """

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_uri(file_uri=audio_uri, mime_type="audio/mpeg"),
                    types.Part.from_uri(file_uri=video_uri, mime_type="video/mp4"),
                    types.Part.from_text(text=prompt)
                ]
            )
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        )
    )

    print("\n[GEMINI] Analiz Tamamlandı!")
    return response.text

if __name__ == "__main__":
    video = "Lesson_Records/1777550695949___4.L2_Araba_Olu__turmak.mp4"
    audio = "alideniz.mp3"
    result = identify_student_with_gemini(video, audio)
    print(result)
    
    # Sonucu kaydet
    with open("core/registry_output/ali_deniz_gemini_match.json", "w", encoding="utf-8") as f:
        f.write(result)
