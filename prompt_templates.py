# 1. Precision Search Prompt (Used for Stage 2)
PRECISION_SEARCH_PROMPT = """
Sana verilen bu 10 dakikalık video segmentinde, aşağıdaki pedagojik metrikleri temsil eden en iyi anları (kesin zaman damgaları ile) bulman gerekiyor:

ARANACAK METRİKLER:
{metrics_list}

Gövenden beklenen, her metrik için videodaki en güçlü KANITI (Evidence) bulup şu JSON formatında döndürmektir:

{{
  "metrics": {{
    "metrik_adi": {{
      "exact_timestamp": "mm:ss",
      "evidence_description": "O anda tam olarak ne oldu? (Kısa cümle)",
      "quote": "Öğretmenin o andaki sözü (Varsa)"
    }}
  }}
}}

Yanıt sadece JSON olmalı.
"""

# 2. Final Report Prompt (Updated for Stage 3)
REPORT_PROMPT = """
Sen bir pedagogical uzmansın. Bir Kodland öğretmeni tarafından verilen dersin videosunu analiz edeceksin.
Görevin, aşağıdaki "Hassas Kanıt Planı"na dayanarak profesyonel bir QA Raporu oluşturmaktır.

HASSAS KANIT PLANI:
{evidence_plan}

Görevin, ekteki örnek PDF (Zehra Bozkurt (8).pdf) yapısına tamamen sadık kalarak bir "QA Raporu" oluşturmaktır.
Raporun her bölümü, yukarıdaki kesin zaman damgalarına atıfta bulunmalıdır.

NOT: Tüm yorumlar Türkçe olmalı.
Raporu Markdown formatında oluştur.
"""

SYSTEM_INSTRUCTION = "Sen deneyimli bir eğitim kalitesi kontrol uzmanısın. Videonun belirli anlarını inceleyerek objektif ve yapıcı bir rapor hazırlarsın."
