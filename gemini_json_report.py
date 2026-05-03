import json
import os
import time
from google import genai

# Gemini API Key
API_KEY = "AIzaSyAu8-GGkJ80nVuzEYXvF2Bj7idqaI3SJYQ"

def generate_json_report(student_name, chunks):
    """
    Her chunk için Gemini'den JSON formatında rapor alır.
    """
    print(f"\n[START] Gemini JSON Raporu olusturuluyor: {student_name}")
    
    client = genai.Client(api_key=API_KEY)
    reports = []
    
    for i, chunk in enumerate(chunks):
        if i > 0:
            time.sleep(5) # Rate limit için bekleme
        
        # Sadece öğrenci ve öğretmen arasındaki diyaloğu alalım (bağlam için)
        transcript_text = "\n".join([f"Speaker {u['speaker']}: {u['text']}" for u in chunk])
        
        prompt = f"""
        Aşağıdaki ders transkriptine dayanarak {student_name} isimli öğrenci için pedagojik bir analiz yap.
        Öğrenci transkriptte 'Speaker B' olarak etiketlenmiştir.
        Çıktıyı SADECE aşağıdaki JSON formatında ver, başka hiçbir metin ekleme:
        {{
            "student_name": "{student_name}",
            "chunk_index": {i},
            "participation_score": 0-100,
            "focus_score": 0-100,
            "communication_quality": "string",
            "key_strengths": ["list"],
            "improvement_areas": ["list"],
            "summary": "string"
        }}
        
        Transkript:
        {transcript_text}
        """
        
        print(f"   [>>] Chunk {i} analiz ediliyor...")
        
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                }
            )
            
            report_data = json.loads(response.text)
            reports.append(report_data)
            print(f"   [OK] Chunk {i} tamamlandi.")
            
        except Exception as e:
            print(f"   [!] Chunk {i} için hata oluştu: {e}")
            continue
        
    return reports

def merge_reports(reports):
    """
    Farklı chunklardan gelen raporları birleştirir.
    """
    if not reports:
        return None
        
    print("\n[START] Raporlar birlestiriliyor (Merger)...")
    
    total_chunks = len(reports)
    avg_participation = sum(r.get("participation_score", 0) for r in reports) / total_chunks
    avg_focus = sum(r.get("focus_score", 0) for r in reports) / total_chunks
    
    combined_strengths = []
    for r in reports:
        combined_strengths.extend(r.get("key_strengths", []))
    combined_strengths = list(set(combined_strengths))
    
    combined_improvement = []
    for r in reports:
        combined_improvement.extend(r.get("improvement_areas", []))
    combined_improvement = list(set(combined_improvement))
    
    final_summary = " ".join([r.get("summary", "") for r in reports])
    
    final_report = {
        "student_name": reports[0]["student_name"],
        "total_chunks": total_chunks,
        "average_participation": round(avg_participation, 2),
        "average_focus": round(avg_focus, 2),
        "combined_strengths": combined_strengths,
        "combined_improvement": combined_improvement,
        "final_summary": final_summary
    }
    return final_report

if __name__ == "__main__":
    chunks_path = "core/registry_output/student_chunks.json"
    if not os.path.exists(chunks_path):
        print(f"[!] {chunks_path} bulunamadi.")
    else:
        with open(chunks_path, "r", encoding="utf-8") as f:
            all_chunks = json.load(f)
        
        if "Omer" in all_chunks:
            omer_reports = generate_json_report("Omer", all_chunks["Omer"])
            if omer_reports:
                final = merge_reports(omer_reports)
                
                output_path = "core/registry_output/final_merged_report_omer.json"
                with open(output_path, "w", encoding="utf-8") as f:
                    json.dump(final, f, ensure_ascii=False, indent=2)
                print(f"[OK] Final rapor kaydedildi: {output_path}")
            else:
                print("[!] Omer icin rapor olusturulamadi.")
        else:
            print(f"[!] Omer bulunamadi. Mevcutlar: {list(all_chunks.keys())}")
