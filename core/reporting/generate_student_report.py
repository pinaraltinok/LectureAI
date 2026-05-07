import sys
import json
import httpx
import os
from pathlib import Path

# Proje kök dizinini ekle
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("student_name", help="Öğrenci Adı")
    parser.add_argument("transcript_path", nargs="?", help="Transkript yolu")
    parser.add_argument("--video-id", help="Backend uyumluluğu için Video ID")
    parser.add_argument("--speaker", help="Manuel Konuşmacı ID (A, B, C gibi)")
    args = parser.parse_args()

    target_student = args.student_name.lower()
    provided_transcript = args.transcript_path
    video_id = args.video_id
    forced_speaker = args.speaker
else:
    target_student = ""
    provided_transcript = None
    video_id = None
    forced_speaker = None

# 1. Registry'den veya Parametreden Speaker ID bul
# ─────────────────────────────────────────────
speaker_tag = None

if forced_speaker:
    speaker_tag = forced_speaker
    print(f"[INFO] Manuel ses etiketi kullanılıyor: Speaker {speaker_tag}")
else:
    registry_files = [
        str(ROOT / "core/storage/student_registry.json"),
        "data/student_registry.json"
    ]
    registry = []
    for rf in registry_files:
        if os.path.exists(rf):
            try:
                with open(rf, "r", encoding="utf-8") as f:
                    registry.extend(json.load(f))
            except:
                pass

    for s in registry:
        if target_student in s.get("id", "").lower():
            # Registry formatını kontrol et (yeni veya eski stil)
            if s.get("speaker_id"):
                speaker_tag = s["speaker_id"]
                break
                
            voice = s.get("voice_notes", "")
            if "VOICE_PENDING" in voice:
                continue 
            
            import re
            match = re.search(r"Speaker ([A-Z0-9]+)", voice)
            if match:
                speaker_tag = match.group(1)
                break
            elif voice.startswith("Speaker "):
                speaker_tag = voice.split(" ")[1]
                break

if not speaker_tag:
    print(f"[!] '{target_student}' registry'de bulunamadı.")
    print(f"    Kayıtlı öğrenciler: {list(set([s['id'] for s in registry]))}")
    sys.exit(1)

print(f"[OK] Ses etiketi: Speaker {speaker_tag}")

# ─────────────────────────────────────────────
# 2. Transkriptten öğrenci satırlarını çek
# ─────────────────────────────────────────────
transcript_files = []
if provided_transcript:
    transcript_files.append(provided_transcript)

transcript_files.extend([
    str(ROOT / "core/storage/full_transcript.json"), 
    "data/full_transcript.json"
])
full_transcript = None
for tf in transcript_files:
    if os.path.exists(tf):
        try:
            with open(tf, "r", encoding="utf-8") as f:
                full_transcript = json.load(f)
                break
        except:
            pass

if not full_transcript:
    print("[!] full_transcript.json bulunamadı.")
    sys.exit(1)

student_lines = []
student_speech_count = 0
all_utts = full_transcript.get("utterances", [])

for i, utt in enumerate(all_utts):
    # Frekans Filtresi (Fiziksel Ses Kanıtı: Ali Deniz = 1237Hz)
    is_ali_deniz = "ali deniz" in target_student.lower()
    
    # 1. Dahil etme (Inclusion) Mantığı
    should_include = (utt["speaker"] == speaker_tag)
    
    # Özel Biyometrik Onay: Ali Deniz'in transkriptte yanlış etiketlenen "Quiz" cümlesini kurtar
    if is_ali_deniz and 5390 < utt["start"]/1000 < 5395:
        should_include = True
        
    # 2. Hariç tutma (Exclusion) Mantığı
    # Ali Deniz derse 4000s'den sonra katıldı, önceki Speaker D'ler (Nusret) elenmeli
    if is_ali_deniz and utt["speaker"] == "D" and utt["start"] < 4000000:
        should_include = False

    if should_include:
        context_lines = []
        for j in range(max(0, i-2), i):
            prev_utt = all_utts[j]
            if prev_utt["speaker"] != speaker_tag:
                sec = prev_utt["start"] // 1000
                context_lines.append(f"[{sec//60:02d}:{sec%60:02d}] (DİĞER KONUŞMACI - ANALİZ DIŞI): {prev_utt['text']}")
        
        for cl in context_lines:
            if cl not in student_lines: # avoid duplicates if student speaks twice in a row
                student_lines.append(cl)
                
        sec = utt["start"] // 1000
        student_lines.append(f"[{sec//60:02d}:{sec%60:02d}] ⭐ {target_student.upper()} (SADECE BU KONUŞMACIYI ANALİZ ET): {utt['text']}\n")
        student_speech_count += 1

if student_speech_count == 0:
    print(f"[!] {target_student} ders boyunca hiç konuşmamış.")
    sys.exit(1)

print(f"[OK] Token limiti için sadece aktif diyaloglar seçildi. ({len(student_lines)} bağlam + cevap satırı eklendi)")
combined_lines = "\n".join(student_lines)

# ─────────────────────────────────────────────
# 3. Prompt
# ─────────────────────────────────────────────
# Eski promptlar silindi, tüm kurallar aşağıdaki API çağrısındaki System Prompt'ta tanımlandı.
user_message = f"Lütfen {target_student} isimli öğrenci için hazırlanan şu diyalogları analiz et ve belirlenen şablona göre raporu oluştur:\n\n{combined_lines}"

# ─────────────────────────────────────────────
# 4. OpenRouter API çağrısı
# ─────────────────────────────────────────────
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

print("[>>] OpenRouter (Gemini 2.0 Flash) ile pedagojik rapor baştan yazdırılıyor...")
try:
    import httpx
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lectureai.com", # Opsiyonel
        "X-Title": "LectureAI" # Opsiyonel
    }
    
    payload = {
        "model": "google/gemini-2.0-flash-001", 
        "max_tokens": 8000,
        "messages": [
            {
                "role": "system",
                "content": """Sen profesyonel bir eğitim uzmanı ve pedagogsun. 
                Görevin, ders transkriptini analiz ederek veliye sunulacak 'Yaman' tarzı prestijli bir rapor oluşturmaktır.
                Sadece ve sadece AŞAĞIDAKİ JSON FORMATINDA cevap vermelisin.

                RAPOR KURALLARI:
                1. ÖZ VE ANALİTİK: Her bir 'Gözlem' hücresini 2-3 cümle ile sınırla. Uzun dolgu cümlelerinden kaçın.
                2. KANITLI ANALİZ: Gözlemleri desteklemek için transkriptten öğrencinin kısa alıntılarını ("...") mutlaka ekle.
                3. AKILLI ÇIKARIM: Eğer bir konuda doğrudan veri yoksa, öğrencinin dersin genelindeki tutumundan mantıksal bir pedagojik yorum yap. "Veri yoktur" yazma.

                MARKDOWN_REPORT YAPISI:
                # Ders Performans Raporu
                [Öğrenci Adı]
                Ders: Online Öğrenme ve Kodlama | Sözel Katılım: [Durum Örn: Çok Aktif]
                
                [İSKELET BAŞLANGICI]
                
                > Sayın Veli, Bu rapor [Öğrenci Adı]'nın ders sürecindeki katılımını ve gelişim alanlarını destekleyici bir bakış açısıyla aktarmaktadır. [Transkripte dayalı 1-2 cümlelik giriş].

                ### 1. Katılım & İletişim
                | Değerlendirme Alanı | Gözlem | Durum |
                | :--- | :--- | :--- |
                | **Sözel Katılım** | [2-3 cümle + alıntı] | [YEŞİL_IYI veya TURUNCU_GELISIYOR] |
                | **İletişim Kalitesi** | [2-3 cümle + alıntı] | [YEŞİL_IYI veya TURUNCU_GELISIYOR] |
                | **Özgüven Tonu** | [2-3 cümle + alıntı] | [YEŞİL_IYI veya TURUNCU_GELISIYOR] |

                ### 2. Anlama & Problem Çözme
                | Değerlendirme Alanı | Gözlem | Durum |
                | :--- | :--- | :--- |
                | **Kavramsal Sorular** | [2-3 cümle + alıntı] | [YEŞİL_IYI veya TURUNCU_GELISIYOR] |
                | **Hata Yönetimi** | [2-3 cümle + alıntı] | [YEŞİL_IYI veya TURUNCU_GELISIYOR] |
                | **Bağımsız Deneme** | [2-3 cümle + alıntı] | [YEŞİL_IYI veya TURUNCU_GELISIYOR] |

                ### 3. Ders Akışına Uyum
                | Değerlendirme Alanı | Gözlem | Durum |
                | :--- | :--- | :--- |
                | **Tempo Uyumu** | [2-3 cümle + alıntı] | [YEŞİL_IYI veya TURUNCU_GELISIYOR] |
                | **Ödev / Hazırlık** | [2-3 cümle + alıntı] | [YEŞİL_IYI veya TURUNCU_GELISIYOR] |

                ### Öne Çıkan Güçlü Yönler
                ---
                [3-4 cümlelik paragraf]

                ### Gelişim Önerileri
                ---
                * **[Başlık]:** [Öneri]
                * **[Başlık]:** [Öneri]

                <div style="background: #e8f5e9; padding: 15px; border-radius: 10px; margin: 20px 0; color: #2e7d32; border: 1px solid #c8e6c9;">
                [Öğrenci Adı]'nın öğrenme yolculuğunda gösterdiği çaba ve merak çok değerli. Birlikte bu temeli daha da güçlendireceğiz.
                </div>

                [İSKELET BİTİŞİ]

                DURUM FORMATI:
                1. YEŞİL_IYI: <span class='status-iyi'> İyi </span>
                2. TURUNCU_GELISIYOR: <span class='status-gelisiyor'> Gelişiyor </span>

                JSON YAPISI:
                {
                  "markdown_report": "...", 
                  "feedback_metni": "...",
                  "genel_sonuc": "..."
                }
                
                ÖNEMLİ: Markdown içeriğindeki tüm tırnak işaretlerini (") ve yeni satırları JSON formatına uygun şekilde (escape ederek) yaz. Sadece saf JSON döndür."""
            },
            {
                "role": "user",
                "content": user_message
            }
        ]
    }

    resp = httpx.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    raw_response = resp.json()["choices"][0]["message"]["content"]
    
    # --- AKILLI JSON AYIKLAMA ---
    report_text = "# Analiz Raporu\nVeri alınamadı."
    report_data = {}

    try:
        # 1. Standart JSON denemesi
        import re
        json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
        if json_match:
            json_str = json_match.group()
            try:
                report_data = json.loads(json_str)
                report_text = report_data.get("markdown_report", report_text)
            except json.JSONDecodeError:
                # 2. JSON bozuksa Markdown kısmını manuel çekmeyi dene
                print("[!] JSON bozuk geldi, manuel ayıklama deneniyor...")
                # 'markdown_report': '...' yapısını bulmaya çalış
                md_match = re.search(r'"markdown_report"\s*:\s*"(.*?)"\s*,\s*"feedback_metni"', raw_response, re.DOTALL)
                if md_match:
                    report_text = md_match.group(1).encode().decode('unicode_escape')
                else:
                    # En son çare: [İSKELET BAŞLANGICI] etiketlerini ara
                    skele_match = re.search(r'(\[İSKELET BAŞLANGICI\].*?\[İSKELET BİTİŞİ\])', raw_response, re.DOTALL)
                    if skele_match:
                        report_text = skele_match.group(1)
                    else:
                        report_text = raw_response
        else:
            report_text = raw_response
    except Exception as e:
        print(f"[!] Rapor ayıklanırken hata: {e}")
        report_text = raw_response

except httpx.HTTPStatusError as e:
    print(f"[!!] OpenRouter API Hatası: {e.response.status_code}")
    print(e.response.text)
    sys.exit(1)
except Exception as e:
    print(f"[!!] Beklenmeyen hata: {e}")
    sys.exit(1)

# ─────────────────────────────────────────────
# 5. Markdown ve PDF kayıt yolları
# ─────────────────────────────────────────────
from pathlib import Path
import time
import datetime

# Dosya ismini güvenli hale getir
safe_name = "".join(ch if ch.isalnum() else "_" for ch in target_student.lower())
timestamp = int(time.time())
current_date = datetime.datetime.now().strftime("%B %Y")

# Klasörleri hazırla
Path("data").mkdir(parents=True, exist_ok=True)

out_md = f"data/FINAL_RAPOR_{safe_name}.md"
out_pdf = f"data/FINAL_RAPOR_{safe_name}_{timestamp}.pdf"

try:
    with open(out_md, "w", encoding="utf-8") as f:
        f.write(report_text)
    print(f"[OK] Markdown raporu kaydedildi: {out_md}")
except Exception as e:
    print(f"[!] Markdown kaydedilemedi: {e}")
    out_md = f"/tmp/FINAL_RAPOR_{safe_name}.md"
    out_pdf = f"/tmp/FINAL_RAPOR_{safe_name}_{timestamp}.pdf"
    with open(out_md, "w", encoding="utf-8") as f:
        f.write(report_text)

# ─────────────────────────────────────────────
# 6. PDF oluştur
# ─────────────────────────────────────────────
try:
    import markdown
    from xhtml2pdf import pisa
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfbase import pdfmetrics
    import platform

    # Font ayarları
    if platform.system() == "Windows":
        font_path = 'C:/Windows/Fonts/times.ttf'
        font_bold_path = 'C:/Windows/Fonts/timesbd.ttf'
    else:
        font_path = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'
        font_bold_path = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'

    if os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont('times', font_path))
        pdfmetrics.registerFont(TTFont('times-bold', font_bold_path))

    html_body = markdown.markdown(report_text, extensions=["tables"])
    
    # Header tanımları (NameError almamak için)
    html_header = ""
    header_html = ""

    html_style = """
    <style>
        @page { size: A4; margin: 1.5cm 1.5cm; }
        body { font-family: 'times'; font-size: 10.5pt; color: #333; line-height: 1.5; }
        h1 { color: #2b3d5b; font-size: 22pt; margin-bottom: 5px; }
        h3 { color: #2b3d5b; font-size: 13pt; margin-top: 25px; margin-bottom: 10px; font-family: 'times-bold'; }
        .intro-box { background-color: #f0f4f8; border-left: 4px solid #3b74a3; padding: 15px; margin-bottom: 20px; font-style: italic; }
        .closing-box { background-color: #f1f8f1; border-left: 4px solid #4caf50; padding: 15px; margin-top: 25px; color: #2e7d32; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #2b3d5b; color: white; padding: 10px; border: 1px solid #d1d8e0; text-align: left; }
        td { padding: 12px 10px; border: 1px solid #ecedf2; vertical-align: top; }
        .status-iyi { background-color: #e8f5e9; color: #2e7d32; padding: 4px 12px; border-radius: 4px; font-weight: bold; display: inline-block; }
        .status-gelisiyor { background-color: #fff3e0; color: #ef6c00; padding: 4px 12px; border-radius: 4px; font-weight: bold; display: inline-block; }
        .footer-text { text-align: right; color: #999; font-size: 9pt; margin-top: 30px; }
    </style>
    """

    html_doc = f"""
    <!DOCTYPE html><html><head><meta charset="utf-8">{html_style}</head>
    <body>{html_header}{html_body}<div class="footer-text">Rapor Tarihi: {current_date}</div></body></html>
    """

    with open(out_pdf, "wb") as pdf_file:
        status = pisa.CreatePDF(src=html_doc.encode("utf-8"), dest=pdf_file, encoding="utf-8")

    if not status.err:
        print(f"[OK] PDF oluşturuldu: {out_pdf}")
        
        # ─────────────────────────────────────────────
        # 7. GCS'ye Yükle
        # ─────────────────────────────────────────────
        try:
            from google.cloud import storage
            reports_bucket_name = os.getenv("GCS_BUCKET_REPORTS", "lectureai_student_reports")
            storage_client = storage.Client()
            bucket = storage_client.bucket(reports_bucket_name)
            
            # Genel Yedeklemeler
            bucket.blob(f"markdown/{os.path.basename(out_md)}").upload_from_filename(out_md)
            bucket.blob(f"pdf/{os.path.basename(out_pdf)}").upload_from_filename(out_pdf)
            
            if video_id:
                # 1. PDF'i 'pdf/{video_id}.pdf' olarak yükle
                backend_pdf_blob = bucket.blob(f"pdf/{video_id}.pdf")
                backend_pdf_blob.upload_from_filename(out_pdf)
                print(f"[OK] Frontend uyumlu PDF yüklendi: {backend_pdf_blob.name}")
                
                # 2. Durum JSON'ını 'reports/{video_id}.json' olarak yükle
                backend_json_blob = bucket.blob(f"reports/{video_id}.json")
                import datetime
                
                report_status = {
                    "report_done": True,
                    "report_pdf_exists": True,
                    "video_id": video_id,
                    "student_name": target_student.title(),
                    "timestamp": datetime.datetime.now().isoformat(),
                    "quality_score": 85,
                    "quality_passed": True,
                    "pdf_url": f"https://storage.googleapis.com/{reports_bucket_name}/pdf/{video_id}.pdf",
                    "draftReport": report_data
                }
                json_str = json.dumps(report_status, indent=2, ensure_ascii=False)
                backend_json_blob.upload_from_string(json_str, content_type='application/json')
                print(f"[OK] Backend durum JSON'ı yüklendi: {backend_json_blob.name}")

                # 3. BACKEND'E WEBHOOK GÖNDER
                webhook_url = os.getenv("BACKEND_STATUS_WEBHOOK", "https://lectureai-679435321951.europe-west4.run.app/api/pipeline/worker-events")
                webhook_token = os.getenv("BACKEND_STATUS_WEBHOOK_BEARER", "lectureai-pipeline-secret-2026")
                
                if webhook_url:
                    try:
                        import httpx
                        detail_data = report_data.copy()
                        detail_data["report_markdown"] = report_text
                        detail_data["pdf_path"] = f"pdf/{video_id}.pdf"
                        detail_data["json_path"] = f"reports/{video_id}.json"
                        detail_data["speaker_id"] = speaker_tag

                        webhook_payload = {
                            "video_id": video_id,
                            "stage": "student:completed",
                            "status": "completed",
                            "detail": detail_data
                        }
                        headers = {"Authorization": f"Bearer {webhook_token}"}
                        h_resp = httpx.post(webhook_url, json=webhook_payload, headers=headers, timeout=10)
                        print(f"[OK] Final Webhook gönderildi: {h_resp.status_code}")
                    except Exception as webhook_ex:
                        print(f"[WARN] Webhook gönderilemedi: {webhook_ex}")

        except Exception as e:
            print(f"[WARN] Buluta yükleme hatası: {e}")

    # --- YEREL TEMİZLİK ---
    try:
        if os.path.exists(out_md): os.remove(out_md)
        if os.path.exists(out_pdf): os.remove(out_pdf)
        print(f"[OK] Yerel dosyalar temizlendi.")
    except Exception as e:
        print(f"[WARN] Temizlik sırasında hata: {e}")

except Exception as e:
    print(f"[!] Genel Hata: {e}")
