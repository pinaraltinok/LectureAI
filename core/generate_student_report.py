"""
Phase 3: Generate Student-Specific Report
Usage: python generate_student_report.py "gökçe ece"
"""
import sys
import json
import httpx
import os

if len(sys.argv) < 2:
    print("Kullanım: python generate_student_report.py \"<Öğrenci Adı>\" [transcript_path]")
    sys.exit(1)

target_student = sys.argv[1].lower()
provided_transcript = sys.argv[2] if len(sys.argv) > 2 else None

# ─────────────────────────────────────────────
# 1. Registry'den Speaker ID bul
# ─────────────────────────────────────────────
registry_files = ["core/registry_output/student_registry.json", "data/student_registry.json"]
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
    "core/registry_output/full_transcript.json", 
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
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={GEMINI_API_KEY}"
    headers = {'Content-Type': 'application/json'}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": """Sen profesyonel bir eğitim uzmanısın. 
        KRİTİK KURAL: Sadece '⭐' ile işaretlenmiş ve '(SADECE BU KONUŞMACIYI ANALİZ ET)' notu düşülmüş satırları analiz et. 
        '(DİĞER KONUŞMACI - ANALİZ DIŞI)' olarak işaretlenen satırlar sadece bağlam (context) içindir; bu satırlardaki fikirleri, eylemleri veya başarıları ASLA hedef öğrenciye mal etme. 
        Eğer hedef öğrenci bir fikre sadece 'Evet' diyerek katılıyorsa, o fikri öğrencinin kendi fikriymiş gibi raporlama. 
        Pedagojik dili koru ve Markdown tabloları kullan."""}]}
    }

    resp = httpx.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    report_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]

except httpx.HTTPStatusError as e:
    status = getattr(e.response, "status_code", None)
    if status in [429, 503]:
        print("[WARN] Gemini API kota limiti nedeniyle rapor şablonla (offline) üretilecek.")
        import re

        student_texts = [u["text"] for u in all_utts if u.get("speaker") == speaker_tag and u.get("text")]

        def tok(s):
            return re.findall(r"[0-9a-zA-ZİIıŞşĞğÜüÖöÇç_]+", s.lower())

        word_counts = [len(tok(t)) for t in student_texts] or [0]
        avg_words = sum(word_counts) / max(1, len(word_counts))
        total_words = sum(word_counts)

        tech_terms = {
            "api", "gpu", "model", "whisper", "mediapipe", "ocr", "transkript", "transcript",
            "notebook", "jupyter", "prototip", "pipeline", "ffmpeg", "ses", "video"
        }
        tech_hits = sum(1 for t in student_texts for w in tok(t) if w in tech_terms)
        question_hits = sum(1 for t in student_texts if "?" in t or any(w in tok(t) for w in ("neden", "nasıl", "niye")))
        initiative_hits = sum(1 for t in student_texts if any(x in t.lower() for x in ("ben denedim", "ben yapt", "prototip", "denem", "test ett", "çalıştım")))
        planning_hits = sum(1 for t in student_texts if any(x in t.lower() for x in ("haftaya", "sonraki", "toplantı", "plan", "takvim")))
        hedge_hits = sum(1 for t in student_texts if any(x in t.lower() for x in ("şey", "yani", "galiba", "emin değil", "tam net")))

        def label_from(value, good, ok):
            if value >= good:
                return "✓ İyi"
            if value >= ok:
                return "~ Gelişiyor"
            return "↑ Çalışılacak"

        participation = label_from(len(student_texts), 6, 3)
        comm_quality = label_from(avg_words, 10, 6)
        confidence = "✓ İyi" if hedge_hits <= max(1, len(student_texts) // 6) else "~ Gelişiyor"
        logical = "✓ İyi" if (tech_hits >= 6 or initiative_hits >= 2) else ("~ Gelişiyor" if tech_hits >= 2 else "↑ Çalışılacak")
        error_mgmt = "~ Gelişiyor"
        if any(x in " ".join(student_texts).lower() for x in ("hata", "sorun", "çıkmadı", "düzgün", "problem")):
            error_mgmt = "✓ İyi" if any(x in " ".join(student_texts).lower() for x in ("çöz", "düzelt", "denedim", "farklı")) else "~ Gelişiyor"
        independent = "✓ İyi" if initiative_hits >= 1 else ("~ Gelişiyor" if tech_hits >= 1 else "↑ Çalışılacak")
        tempo = "~ Gelişiyor" if len(student_texts) < 4 else "✓ İyi"
        prep = "✓ İyi" if (initiative_hits >= 1 or planning_hits >= 1) else "~ Gelişiyor"

        intro_extra = "Derse düzenli şekilde dahil olmuş ve konuşmalarında konuya dair somut geri bildirimler vermiştir."
        if initiative_hits >= 1:
            intro_extra = "Ders sürecine somut denemeler/prototiplerle dahil olmuş ve süreci iyileştirme odaklı yaklaşmıştır."
        elif question_hits >= 2:
            intro_extra = "Ders akışında merakını sorularla göstererek konuyu derinleştirme eğilimi sergilemiştir."

        strengths = "Sürece katkı verme ve iletişimde süreklilik sağlama becerisi öne çıkıyor."
        if initiative_hits >= 1:
            strengths = "Bağımsız deneme yapma ve ortaya çıkan sonuçları analiz ederek ilerleme planı oluşturma becerisi öne çıkıyor."
        elif tech_hits >= 4:
            strengths = "Teknik kavramları takip edip doğru bağlamda kullanma becerisi öne çıkıyor."

        tips = []
        if participation != "✓ İyi":
            tips.append("- **Sözlü Katılımı Artırma:** Kısa yanıtlar yerine, 1-2 cümle ile gerekçe ekleyerek katılımın görünürlüğünü artırabilir.")
        if comm_quality != "✓ İyi":
            tips.append("- **İfade Netliği:** Bir fikri aktarırken önce amaç, sonra yöntem ve en sonda beklenen çıktı şeklinde yapılandırma önerilir.")
        if independent != "✓ İyi":
            tips.append("- **Mini Denemeler:** 10-20 saniyelik küçük örnekler üzerinde test yapıp sonuçları notlamak öğrenmeyi hızlandırır.")
        if not tips:
            tips = [
                "- **Hata Günlüğü:** Denemelerde karşılaşılan hataları ve çözüm adımlarını kısa notlarla takip etmek süreklilik sağlar.",
                "- **Küçük Test Setleri:** Parametre değişikliklerinin çıktıya etkisini küçük örneklerle karşılaştırmak doğruluğu artırır.",
            ]

        report_text = f"""[İSKELET BAŞLANGICI]
<div class="intro-box">
<strong>Sayın Veli,</strong> Bu rapor {target_student.title()}'nin ders sürecindeki katılımını ve gelişim alanlarını destekleyici bir bakış açısıyla aktarmaktadır. {intro_extra}
</div>

### 1. Katılım & İletişim

| Ölçüt | Pedagojik Gözlem | Durum |
| :--- | :--- | :--- |
| **Sözel Katılım** | Ders akışında {len(student_texts)} kez söz alarak görüş bildirmiştir. | {participation} |
| **İletişim Kalitesi** | Ortalama ifade uzunluğu ~{avg_words:.1f} kelime düzeyindedir; mesaj netliği ve gerekçelendirme düzeyi bu veriye göre değerlendirilmiştir. | {comm_quality} |
| **Özgüven Tonu** | İfadelerde belirsizlik belirten kalıplar {hedge_hits} kez görülmüştür; süreç içinde daha net cümlelerle ilerleme potansiyeli vardır. | {confidence} |

### 2. Anlama & Problem Çözme

| Ölçüt | Pedagojik Gözlem | Durum |
| :--- | :--- | :--- |
| **Mantıksal Çözümleme** | Teknik kavram kullanımı ve çözüm adımı üretme eğilimi {tech_hits} gösterge ile tespit edilmiştir. | {logical} |
| **Hata Yönetimi** | Deneme/sonuç değerlendirme yaklaşımı; problem tespiti ve alternatif denemeler üzerinden yorumlanmıştır. | {error_mgmt} |
| **Bağımsız Deneme** | Ders dışı/bağımsız deneme işaretleri {initiative_hits} kez görülmüştür. | {independent} |

### 3. Ders Akışına Uyum

| Ölçüt | Pedagojik Gözlem | Durum |
| :--- | :--- | :--- |
| **Tempo Uyumu** | Diyalog içinde kısa-orta uzunlukta yanıtlarla akışı takip etmiştir. | {tempo} |
| **Hazırlık ve Materyal Kullanımı** | Süreç planlama/deneme çıktısı paylaşımı göstergeleri {planning_hits} kez görülmüştür. | {prep} |
| **Hedef Belirleme** | Ders içindeki ifade örneklerinde hedef/çıktı tanımlama düzeyi göz önünde bulundurulmuştur. | ~ Gelişiyor |

### Öne Çıkan Güçlü Yönler
{strengths}

### Gelişim Önerileri
{chr(10).join(tips)}

<div class="end-box">
{target_student.title()}'nin öğrenme yolculuğunda gösterdiği çaba ve merak çok değerli. Birlikte bu temeli daha da güçlendireceğiz.
</div>
[İSKELET BİTİŞİ]
"""
    else:
        print(f"[!!] Gemini API Hatası: {status}")
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

    # Cross-platform font registration
    import platform
    _font_registered = False
    if platform.system() == 'Windows':
        win_font = 'C:/Windows/Fonts/times.ttf'
        win_bold = 'C:/Windows/Fonts/timesbd.ttf'
        if os.path.exists(win_font):
            pdfmetrics.registerFont(TTFont('times', win_font))
            pdfmetrics.registerFont(TTFont('times-bold', win_bold))
            _font_registered = True

    if not _font_registered:
        # Linux: use DejaVuSans (available on most distros)
        import glob
        dejavu_paths = glob.glob('/usr/share/fonts/**/DejaVuSans.ttf', recursive=True)
        dejavu_bold = glob.glob('/usr/share/fonts/**/DejaVuSans-Bold.ttf', recursive=True)
        if dejavu_paths:
            pdfmetrics.registerFont(TTFont('times', dejavu_paths[0]))
            pdfmetrics.registerFont(TTFont('times-bold', dejavu_bold[0] if dejavu_bold else dejavu_paths[0]))
        else:
            # Absolute fallback: use reportlab's built-in Helvetica
            print("[WARN] No TTF fonts found, PDF will use built-in fonts")

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
            
        except Exception as e:
            print(f"[WARN] Buluta yükleme hatası: {e}")
    else:
        print("[!!] PDF oluşturulamadı, MD dosyası kullanılabilir.")

except ImportError:
    print("[!] PDF için: pip install markdown xhtml2pdf")
    print(f"    Markdown raporu hazır: {out_md}")
