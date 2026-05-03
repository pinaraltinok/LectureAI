import json
import os
from google import genai

# Configuration
TRANSCRIPT_PATH = "core/registry_output/1777550695949___4.l2_araba_olu__turmak_full_transcript.json"
STUDENT_NAME = "Yaman"
STUDENT_SPEAKER_ID = "A" # Mapped from Pyannote SPEAKER_01
API_KEY = "AIzaSyAu8-GGkJ80nVuzEYXvF2Bj7idqaI3SJYQ"

def run():
    # 1. Load Transcript
    if not os.path.exists(TRANSCRIPT_PATH):
        print(f"[-] Transcript bulunamadı: {TRANSCRIPT_PATH}")
        return

    with open(TRANSCRIPT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    utterances = data.get("utterances", [])
    if not utterances:
        # Some transcripts might only have 'text' and 'words'
        print("[!] Utterances bulunamadı, kelime bazlı gruplama deneniyor...")
        words = data.get("words", [])
        student_segments = []
        current_speaker = None
        current_text = []
        for w in words:
            if w["speaker"] == STUDENT_SPEAKER_ID:
                current_text.append(w["text"])
            elif current_text:
                student_segments.append(" ".join(current_text))
                current_text = []
        student_only_text = "\n".join(student_segments)
        full_text = data.get("text", "") # Limited context
    else:
        student_segments = [u for u in utterances if u["speaker"] == STUDENT_SPEAKER_ID]
        student_only_text = "\n".join([u["text"] for u in student_segments])
        full_text = "\n".join([f"Speaker {u['speaker']}: {u['text']}" for u in utterances])

    if not student_only_text:
        print(f"[-] {STUDENT_NAME} (Speaker {STUDENT_SPEAKER_ID}) için konuşma bulunamadı.")
        return

    # 3. Call Gemini
    print(f"[>>] Gemini raporu oluşturuluyor ({STUDENT_NAME})...")
    client = genai.Client(api_key=API_KEY)
    
    prompt = f"""
    Aşağıdaki ders transkriptine dayanarak {STUDENT_NAME} isimli öğrenci için projemizin standart pedagojik analiz formatında bir rapor oluştur.
    Öğrenci transkriptte 'Speaker {STUDENT_SPEAKER_ID}' olarak geçmektedir. 
    
    Lütfen raporu SADECE aşağıdaki JSON formatında döndür:
    {{
        "student_name": "{STUDENT_NAME}",
        "metrics": {{
            "participation_score": 0-100,
            "focus_score": 0-100,
            "technical_aptitude": 0-100
        }},
        "analysis": {{
            "communication_quality": "string",
            "key_strengths": ["list"],
            "improvement_areas": ["list"],
            "summary": "string"
        }},
        "pedagogical_notes": "string"
    }}
    
    Transkript:
    {full_text[:15000]}
    """

    try:
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config={
                "response_mime_type": "application/json",
            }
        )

        # 4. Save result as JSON (Our standard)
        output_dir = "core/registry_output"
        os.makedirs(output_dir, exist_ok=True)
        report_path = os.path.join(output_dir, f"{STUDENT_NAME}_Standard_Report.json")
        
        report_json = json.loads(response.text)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report_json, f, ensure_ascii=False, indent=2)
        
        print(f"[OK] Standart metrikli rapor başarıyla oluşturuldu: {report_path}")
        return report_json
    except Exception as e:
        print(f"[-] Gemini hatası: {e}")
        return None

if __name__ == "__main__":
    run()
