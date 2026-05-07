"""
Phase 3: Generate Student-Specific Report
Usage: python generate_student_report.py "gökçe ece"
"""
import sys
import json
import httpx

if len(sys.argv) < 2:
    print("Kullanım: python generate_student_report.py \"<Öğrenci Adı>\"")
    sys.exit(1)

target_student = sys.argv[1].lower()

# ─────────────────────────────────────────────
# 1. Registry'den Speaker ID bul
# ─────────────────────────────────────────────
try:
    with open("data/new_student_registry.json", "r", encoding="utf-8") as f:
        registry = json.load(f)
except FileNotFoundError:
    print("[!] student_registry.json bulunamadı. Önce student_registry_builder.py çalıştırın.")
    sys.exit(1)

speaker_tag = None
for s in registry:
    if target_student in s.get("id", "").lower():
        voice = s.get("voice_notes", "")
        if voice == "VOICE_PENDING":
            print(f"[!] {target_student} ilk 10 dakikada sesle eşleşemedi (VOICE_PENDING).")
            sys.exit(1)
        speaker_tag = voice.split(" ")[1] if voice.startswith("Speaker ") else voice
        break

if not speaker_tag:
    print(f"[!] '{target_student}' registry'de bulunamadı.")
    print(f"    Kayıtlı öğrenciler: {[s['id'] for s in registry]}")
    sys.exit(1)

print(f"[OK] Ses etiketi: Speaker {speaker_tag}")

# ─────────────────────────────────────────────
# 2. Transkriptten öğrenci satırlarını çek
# ─────────────────────────────────────────────
try:
    with open("data/new_video_transcript.json", "r", encoding="utf-8") as f:
        full_transcript = json.load(f)
except FileNotFoundError:
    print("[!] full_transcript.json bulunamadı. Önce extract_full_transcript.py çalıştırın.")
    sys.exit(1)

student_lines = []
student_speech_count = 0
all_utts = full_transcript.get("utterances", [])

for i, utt in enumerate(all_utts):
    if utt["speaker"] == speaker_tag:
        # If student speaks, grab context from up to 2 previous utterances if they aren't from the student
        context_lines = []
        for j in range(max(0, i-2), i):
            prev_utt = all_utts[j]
            if prev_utt["speaker"] != speaker_tag:
                sec = prev_utt["start"] // 1000
                context_lines.append(f"[{sec//60:02d}:{sec%60:02d}] Öğretmen/Diğer: {prev_utt['text']}")
        
        # Add context lines
        for cl in context_lines:
            if cl not in student_lines: # avoid duplicates if student speaks twice in a row
                student_lines.append(cl)
                
        # Add student line
        sec = utt["start"] // 1000
        student_lines.append(f"[{sec//60:02d}:{sec%60:02d}] ⭐ {target_student.upper()}: {utt['text']}\n")
        student_speech_count += 1

if student_speech_count == 0:
    print(f"[!] {target_student} ders boyunca hiç konuşmamış.")
    sys.exit(1)

print(f"[OK] Token limiti için sadece aktif diyaloglar seçildi. ({len(student_lines)} bağlam + cevap satırı eklendi)")
combined_lines = "\n".join(student_lines)

# ─────────────────────────────────────────────
# 3. Prompt
# ─────────────────────────────────────────────
prompt_rubric = """
📋 METRİK ÇERÇEVESİ VE BEKLENEN DURUM ETİKETLERİ:
LLM'den istenen: Her bir Boyut için bir Markdown Tablosu oluştur.
Tablo Sütunları tam olarak şöyle olmalıdır:
| Beceri Alanı | Durum | Gözlem |

Durum sütununa SADECE şu üç etiketten birini yazacaksın (tam olarak kopyala):
1. '✓ İyi' (Eğer öğrenci iyi/aktifse)
2. '~ Gelişiyor' (Eğer öğrenci ortalama, çekingen veya çabalıyorsa)
3. '↑ Çalışılacak' (Eğer öğrenci yetersiz, eksik veya yönlendirmeye kapalıysa)

Boyut 1: Katılım & İletişim
- Sözel Katılım
- İletişim Kalitesi
- Özgüven Tonu

Boyut 2: Anlama & Problem Çözme
- Kavramsal Sorular
- Hata Yönetimi
- Bağımsız Deneme

Boyut 3: Ders Akışına Uyum
- Tempo Uyumu
- Ödev / Hazırlık
"""

prompt = f"""
Sen uzman bir eğitim analistisin. Mükemmel formatta raporlar hazırlarsın.
Aşağıda "1 saatlik online kodlama/yazılım dersinin" {target_student} isimli öğrenciye ait diyalog dökümü (öğretmen dahil) bulunmaktadır:

DIŞA AKTARILAN DİYALOGLAR (Bağlam Dahil):
{combined_lines}

GÖREV:
Aşağıdaki İSKELETİ KESİNLİKLE BOZMADAN, içerikleri ve tabloları doldurarak bir rapor üret.
Metinleri Veliye hitaben, destekleyici, profesyonel bir dille yaz. 

[İSKELET BAŞLANGICI]
<div class="intro-box">
<strong>Sayın Veli,</strong> Bu rapor {target_student.title()}'nin ders sürecindeki katılımını ve gelişim alanlarını destekleyici bir bakış açısıyla aktarmaktadır. [buraya duruma göre yapay zekadan 1-2 cümle daha özet ekle, örneğin: "Derse aktif katılım göstermiş ve iyi adımlar atmıştır."].
</div>

### 1. Katılım & İletişim
[Buraya Boyut 1 tablosunu ekle]

### 2. Anlama & Problem Çözme
[Buraya Boyut 2 tablosunu ekle]

### 3. Ders Akışına Uyum
[Buraya Boyut 3 tablosunu ekle]

### Öne Çıkan Güçlü Yönler
[Buraya öğrencinin en güçlü özelliğini anlatan, diyalogdan örnek veren kısa ve çok akıcı tek bir paragraf yaz]

### Gelişim Önerileri
- [Burası maddeler halinde olacak. Uygulanabilir pratik 2-3 adet gelişim/tavsiye önerisi]

<div class="end-box">
{target_student.title()}'nin öğrenme yolculuğunda gösterdiği çaba ve merak çok değerli. Birlikte bu temeli daha da güçlendireceğiz.
</div>
[İSKELET BİTİŞİ]

ÖNEMLİ KURALLAR:
* Asla tabloların veya satırların içindeki cümlelerde {target_student.title()}'nin adını tekrar etme. Doğrudan öznesiz fiille cümleye başla (Örn: 'Aktif katılım sağlıyor', 'Kurulum aşamasında doğru sorular iletiyor').
* Tablo değerlendirme alanlarını (Gözlem), çocuksu veya fazla gündelik olmayan, pedagojik bir rapor dilinde metrik ağırlıklı dök.
* DURUM sütununda sadece '✓ İyi', '~ Gelişiyor' veya '↑ Çalışılacak' kelime öbekleri kullanılabilir, başkası yasak.
* Sürekli {target_student.title()} demek yerine, giriş cümlesinde bir kez geçmesi raporun profesyonelliği için yeterlidir.
"""

# ─────────────────────────────────────────────
# 4. Gemini API çağrısı (Groq Rate Limit bypass)
# ─────────────────────────────────────────────
GEMINI_API_KEY = "AIzaSyAu8-GGkJ80nVuzEYXvF2Bj7idqaI3SJYQ"

print("[>>] Gemini API ile pedagojik rapor baştan yazdırılıyor...")
try:
    import httpx
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    headers = {'Content-Type': 'application/json'}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": "Sen profesyonel bir eğitim uzmanısın. Her zaman Markdown tabloları kullanarak yapılandırılmış Öğrenci Metrik Çerçeveleri hazırlarsın. İsimleri gereksiz tekrar etmeden ölçülebilir pedagojik dil kullanırsın."}]}
    }

    resp = httpx.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    report_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]

except httpx.HTTPStatusError as e:
    print(f"[!!] Groq API Hatası: {e.response.status_code}")
    print(e.response.text)
    sys.exit(1)
except Exception as e:
    print(f"[!!] Beklenmeyen hata: {e}")
    sys.exit(1)

# ─────────────────────────────────────────────
# 5. Markdown kaydet
# ─────────────────────────────────────────────
out_md = f"data/NEW_VIDEO_RAPOR_{target_student.replace(' ', '_')}.md"
with open(out_md, "w", encoding="utf-8") as f:
    f.write(report_text)
print(f"[OK] Markdown raporu kaydedildi: {out_md}")

# ─────────────────────────────────────────────
# 6. PDF oluştur
# ─────────────────────────────────────────────
try:
    import markdown
    from xhtml2pdf import pisa
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfbase import pdfmetrics

    pdfmetrics.registerFont(TTFont('times', 'C:/Windows/Fonts/times.ttf'))
    pdfmetrics.registerFont(TTFont('times-bold', 'C:/Windows/Fonts/timesbd.ttf'))

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
    out_pdf = f"data/NEW_VIDEO_TIMES_NEW_ROMAN_{target_student.replace(' ', '_')}_Rapor.pdf"
    with open(out_pdf, "wb") as pdf_file:
        status = pisa.CreatePDF(src=html_doc.encode("utf-8"), dest=pdf_file, encoding="utf-8")

    if not status.err:
        print(f"[OK] PDF oluşturuldu: {out_pdf}")
    else:
        print("[!!] PDF oluşturulamadı, MD dosyası kullanılabilir.")

except ImportError:
    print("[!] PDF için: pip install markdown xhtml2pdf")
    print(f"    Markdown raporu hazır: {out_md}")