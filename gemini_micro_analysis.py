import os
from google import genai
from google.genai import types

GEMINI_API_KEY = "AIzaSyAu8-GGkJ80nVuzEYXvF2Bj7idqaI3SJYQ"

def micro_diarize_with_gemini(video_blob_name, start_time, end_time):
    client = genai.Client(api_key=GEMINI_API_KEY)
    video_uri = f"gs://lectureai_full_videos/{video_blob_name}"

    print(f"[GEMINI] Mikro-Analiz başlatılıyor: {start_time}s - {end_time}s")

    prompt = f"""
    Bu videonun {start_time}. saniyesi ile {end_time}. saniyesi arasını çok dikkatli dinle.
    Bu kısımda 'Arabalar' ve 'Quiz' kelimeleri geçiyor. 
    Lütfen şu detayları kesin olarak belirle:
    1. 'Arabalar' kelimesini kim söyledi? (Öğretmen mi, Yaman mı, Nusret mi, Ali Deniz mi?)
    2. 'Quiz' kelimesini kim söyledi? 
    3. Her bir kelimenin tam başladığı saniyeyi yaz.
    4. Bu iki kelime arasında konuşanlar değişiyor mu?
    
    Analizini çok kısa ve net, saniyeleriyle birlikte yap.
    """

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_uri(file_uri=video_uri, mime_type="video/mp4"),
                    types.Part.from_text(text=prompt)
                ]
            )
        ]
    )

    return response.text

if __name__ == "__main__":
    video = "Lesson_Records/1777550695949___4.L2_Araba_Olu__turmak.mp4"
    result = micro_diarize_with_gemini(video, 5385, 5405)
    print("\n--- GEMINI MİKRO-ANALİZ SONUCU ---")
    print(result)
