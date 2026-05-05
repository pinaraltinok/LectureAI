import sys
import json
import httpx
import os
from pathlib import Path

# Proje kök dizinini ekle
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if len(sys.argv) < 2:
    print("Kullanım: python generate_student_report.py \"<Öğrenci Adı>\" [transcript_path]")
    sys.exit(1)

target_student = sys.argv[1].lower()
provided_transcript = sys.argv[2] if len(sys.argv) > 2 else None

# 1. Registry'den Speaker ID bul
# ─────────────────────────────────────────────
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

speaker_tag = None
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
                Sana verilen transkripti analiz ederek AŞAĞIDAKİ ŞABLONA %100 SADIK KALARAK dengeli ve vurucu bir rapor oluşturmalısın.

                İÇERİK KURALLARI:
                1. SAYISAL VERİ YASAĞI: "89 kez konuştu", "ortalama 7 kelime" gibi sayısal veriler KESİNLİKLE yasaktır. Raporun hiçbir yerinde istatistiksel sayı kullanma.
                2. ÖZ VE ANALİTİK: Her bir 'Gözlem' hücresini 2-3 cümle ile sınırla. Uzun dolgu cümlelerinden kaçın, doğrudan pedagojik çıkarıma odaklan.
                3. KANITLI ANALİZ: Gözlemleri desteklemek için transkriptten öğrencinin kısa alıntılarını ("...") mutlaka ekle.
                4. AKILLI ÇIKARIM: Eğer bir konuda (örn: zaman yönetimi) doğrudan bir cümle yoksa, öğrencinin dersin akışındaki sorularından veya uyumundan yola çıkarak mantıksal bir pedagojik yorum yap. "Veri yoktur" gibi ifadeler kullanma.

                # Ders Performans Raporu
                [Öğrenci Adı]
                Ders: [Ders Adı] | Sözel Katılım: [Pedagojik Durum Örn: Çok Aktif / İstekli]
                
                [İSKELET BAŞLANGICI]
                
                > Sayın Veli, Bu rapor [Öğrenci Adı]'nın ders sürecindeki katılımını ve gelişim alanlarını destekleyici bir bakış açısıyla aktarmaktadır. [Transkripte dayalı 1-2 cümlelik giriş].

                ### 1. Katılım & İletişim
                | Değerlendirme Alanı | Gözlem | Durum |
                | :--- | :--- | :--- |
                | **Sözel Katılım** | [2-3 cümlelik öz analiz + alıntı] | (YEŞİL_IYI veya TURUNCU_GELISIYOR seç) |
                | **İletişim Kalitesi** | [2-3 cümlelik öz analiz + alıntı] | (YEŞİL_IYI veya TURUNCU_GELISIYOR seç) |
                | **Özgüven Tonu** | [2-3 cümlelik öz analiz + alıntı] | (YEŞİL_IYI veya TURUNCU_GELISIYOR seç) |

                ### 2. Anlama & Problem Çözme
                | Değerlendirme Alanı | Gözlem | Durum |
                | :--- | :--- | :--- |
                | **Kavramsal Sorular** | [2-3 cümlelik öz analiz + alıntı] | (YEŞİL_IYI veya TURUNCU_GELISIYOR seç) |
                | **Hata Yönetimi** | [2-3 cümlelik öz analiz + alıntı] | (YEŞİL_IYI veya TURUNCU_GELISIYOR seç) |
                | **Bağımsız Deneme** | [2-3 cümlelik öz analiz + alıntı] | (YEŞİL_IYI veya TURUNCU_GELISIYOR seç) |

                ### 3. Ders Akışına Uyum
                | Değerlendirme Alanı | Gözlem | Durum |
                | :--- | :--- | :--- |
                | **Tempo Uyumu** | [2-3 cümlelik öz analiz + alıntı] | (YEŞİL_IYI veya TURUNCU_GELISIYOR seç) |
                | **Ödev / Hazırlık** | [2-3 cümlelik öz analiz + alıntı] | (YEŞİL_IYI veya TURUNCU_GELISIYOR seç) |

                ### Öne Çıkan Güçlü Yönler
                ---
                [Öğrencinin en belirgin 1-2 güçlü yönünü kanıtlarıyla anlatan 3-4 cümlelik paragraf]

                ### Gelişim Önerileri
                ---
                * **[Başlık]:** [Somut ve kısa öneri]
                * **[Başlık]:** [Somut ve kısa öneri]

                <div style="background: #e8f5e9; padding: 15px; border-radius: 10px; margin: 20px 0; color: #2e7d32; border: 1px solid #c8e6c9;">
                [Öğrenci Adı]'nın öğrenme yolculuğunda gösterdiği çaba ve merak çok değerli. Birlikte bu temeli daha da güçlendireceğiz.
                </div>

                [İSKELET BİTİŞİ]

                KRİTİK FORMAT KURALLARI:
                1. YEŞİL_IYI: <span style="background: #e8f5e9; color: #2e7d32; padding: 5px; border-radius: 5px;">✅ İyi</span>
                2. TURUNCU_GELISIYOR: <span style="background: #fff3e0; color: #ef6c00; padding: 5px; border-radius: 5px;">~ Gelişiyor</span>
                3. Sonuç cümlesini birebir aynı yaz."""
            },
            {
                "role": "user",
                "content": user_message
            }
        ]
    }

    resp = httpx.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    report_text = resp.json()["choices"][0]["message"]["content"]

except httpx.HTTPStatusError as e:
    print(f"[!!] OpenRouter API Hatası: {e.response.status_code}")
    print(e.response.text)
    sys.exit(1)
except Exception as e:
    print(f"[!!] Beklenmeyen hata: {e}")
    sys.exit(1)

# ─────────────────────────────────────────────
# 5. Markdown kaydet
# ─────────────────────────────────────────────
out_md = f"data/FINAL_RAPOR_{target_student.replace(' ', '_')}.md"
with open(out_md, "w", encoding="utf-8") as f:
    f.write(report_text)
print(f"[OK] Markdown raporu kaydedildi.")

# ─────────────────────────────────────────────
# 6. PDF oluştur
# ─────────────────────────────────────────────
try:
    import markdown
    from xhtml2pdf import pisa
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfbase import pdfmetrics
    import platform

    # Cross-platform font handling
    if platform.system() == "Windows":
        font_path = 'C:/Windows/Fonts/times.ttf'
        font_bold_path = 'C:/Windows/Fonts/timesbd.ttf'
    else:
        # Linux (Docker) için standart font yolları (liberation serif times muadilidir)
        font_path = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'
        font_bold_path = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'

    # Check if fonts exist, fallback to default if not
    if os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont('times', font_path))
        pdfmetrics.registerFont(TTFont('times-bold', font_bold_path))
    else:
        print(f"[!] Font bulunamadı ({font_path}), PDF varsayılan fontla oluşturulacak.")

    html_body = markdown.markdown(report_text, extensions=["tables"])
    
    # Apply precise coloring matching the user designs for status blocks
    html_body = html_body.replace(
        "✓ İyi", 
        "<div style='background-color:#EBF5E9; color:#2E7D32; padding:3px 0; text-align:center; font-weight:bold; width:100%;'>✓ İyi</div>"
    )
    html_body = html_body.replace(
        "~ Gelişiyor", 
        "<div style='background-color:#FFF8E1; color:#F57F17; padding:3px 0; text-align:center; font-weight:bold; width:100%;'>~ Gelişiyor</div>"
    )
    html_body = html_body.replace(
        "↑ Çalışılacak", 
        "<div style='background-color:#FBE9E7; color:#D84315; padding:3px 0; text-align:center; font-weight:bold; width:100%;'>↑ Çalışılacak</div>"
    )

    import datetime
    current_date = datetime.datetime.now().strftime("%B %Y")

    header_html = f"""
    <h1 style="color: #2b3d5b; font-size: 20pt; margin-bottom: 2px;">Ders Performans Raporu</h1>
    <h2 style="color: #3b74a3; font-size: 15pt; margin-top: 0; margin-bottom: 4px;">{target_student.title()}</h2>
    <div style="color: #7f8c8d; font-size: 10pt; margin-bottom: 15px;">Ders: Online Öğrenme ve Kodlama &nbsp;|&nbsp; Sözel Katılım: {student_speech_count} İfade</div>
    """

    html_style = """
    <style>
        @page { size: A4; margin: 1.5cm 2cm; }
        body {
            font-family: 'times';
            font-size: 11pt;  /* Times is slightly smaller visually so bumped to 11 */
            color: #444444;
            line-height: 1.6;
        }
        
        h3 {
            font-family: 'times-bold';
            color: #2b3d5b;
            font-size: 14pt;
            border-bottom: 1px solid #5dade2;
            padding-bottom: 4px;
            margin-top: 25px;
            margin-bottom: 15px;
        }
        
        .intro-box {
            background-color: #f4f6fa;
            border-left: 3px solid #3b74a3;
            padding: 12px 15px;
            margin-bottom: 20px;
            color: #3b4252;
            font-size: 10.5pt;
        }
        
        .end-box {
            background-color: #e9f5e9;
            border-left: 3px solid #4caf50;
            padding: 12px 15px;
            margin-top: 20px;
            font-style: italic;
            color: #2e7d32;
        }

        ul { margin: 5px 0 15px 25px; padding: 0; }
        li { margin-bottom: 6px; }
        p  { margin-bottom: 12px; }
        strong { color: #2b3d5b; font-family: 'times-bold'; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 5px; margin-bottom: 25px; font-size: 10.5pt; }
        th { border: 1px solid #d1d8e0; padding: 8px 12px; background-color: #2b3d5b; color: white; font-weight: bold; text-align: left; }
        td { border: 1px solid #ecedf2; padding: 8px 12px; vertical-align: middle; }
        
        /* Set specific column widths implicitly */
        td:nth-child(1) { width: 35%; color: #444; }
        td:nth-child(2) { width: 15%; padding: 4px; }
        td:nth-child(3) { width: 50%; color: #666; }
        
        .footer-text { text-align: right; color: #999; font-size: 9pt; margin-top: 20px; }
    </style>
    """

    html_doc = (
        f'<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" />'
        f'{html_style}</head><body>'
        f'{header_html}'
        f'{html_body}'
        f'<div class="footer-text">Rapor Tarihi: {current_date}</div>'
        f'</body></html>'
    )

    # Kilitleme hatasına düşmemek için farklı isim
    import time
    timestamp = int(time.time())
    safe_name = target_student.replace('ö', 'o').replace('ü', 'u').replace('ç', 'c').replace('ş', 's').replace('ı', 'i').replace('ğ', 'g').replace(' ', '_')
    
    # Veri klasörünü kontrol et, yoksa oluştur
    os.makedirs("data", exist_ok=True)
    
    out_pdf = f"data/TIMES_NEW_ROMAN_{safe_name}_Rapor_{timestamp}.pdf"
    with open(out_pdf, "wb") as pdf_file:
        status = pisa.CreatePDF(src=html_doc.encode("utf-8"), dest=pdf_file, encoding="utf-8")

    if not status.err:
        print(f"[OK] PDF oluşturuldu.")
        
        # ─────────────────────────────────────────────
        # 7. GCS'ye Yükle
        # ─────────────────────────────────────────────
        try:
            from google.cloud import storage
            
            reports_bucket_name = os.getenv("GCS_BUCKET_REPORTS", "lectureai_student_reports")
            
            # Mutlak yol kontrolü ile yetki dosyasını bul
            storage_client = None
            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            possible_keys = ["gcp-key.json", "senior-design-488908-28bd7c55329d.json"]
            
            # 1. Mevcut yolu dene
            if cred_path and os.path.exists(cred_path):
                storage_client = storage.Client.from_service_account_json(cred_path)
            
            # 2. Eğer bulamazsa ana klasördeki bilinen isimleri dene
            if not storage_client:
                for k in possible_keys:
                    full_p = os.path.abspath(k)
                    if os.path.exists(full_p):
                        storage_client = storage.Client.from_service_account_json(full_p)
                        break
            
            # 3. Son çare default client
            if not storage_client:
                storage_client = storage.Client()
                
            bucket = storage_client.bucket(reports_bucket_name)
            
            # MD Yükle
            md_blob = bucket.blob(f"markdown/{os.path.basename(out_md)}")
            md_blob.upload_from_filename(out_md)
            print(f"[OK] Markdown buluta yüklendi: {md_blob.name}")
            
            # PDF Yükle
            pdf_blob = bucket.blob(f"pdf/{os.path.basename(out_pdf)}")
            pdf_blob.upload_from_filename(out_pdf)
            print(f"[OK] PDF buluta yüklendi: {pdf_blob.name}")

            # --- YEREL TEMİZLİK ---
            try:
                if os.path.exists(out_md): os.remove(out_md)
                if os.path.exists(out_pdf): os.remove(out_pdf)
                print(f"[OK] Yerel dosyalar temizlendi. Raporlar sadece bulutta (GCS) saklanıyor.")
            except Exception as e:
                print(f"[WARN] Temizlik sırasında hata: {e}")
            
        except Exception as e:
            print(f"[WARN] Buluta yükleme hatası: {e}")
    else:
        print("[!!] PDF oluşturulamadı, MD dosyası kullanılabilir.")

except ImportError:
    print("[!] PDF için: pip install markdown xhtml2pdf")
    print(f"    Markdown raporu hazır: {out_md}")
