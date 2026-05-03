"""Pydantic v2 schemas for the QA (pedagogical) report.

This is the **updated** schema per the final contract: the
`QAReport` replaces the older `PedagogicalReport` and is
structured to match the written lecture QA document used by
the teaching quality team (Turkish, PDF-style feedback).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
#  Enums & leaf models
# --------------------------------------------------------------------------- #
class Rating(str, Enum):
    good = "İyi"
    acceptable = "Geliştirilmeli"
    poor = "Yetersiz"
    na = "Değerlendirilemedi"


class MetricResult(BaseModel):
    """A single evaluated metric (e.g. ``saygi_sinirlar``)."""

    rating: Rating
    observation: str = Field(
        ...,
        description=(
            "Concrete, timestamped observation. "
            'Example: "(13:37) Kısa övgüler kullanıldı."'
        ),
    )
    improvement_tip: str = Field(
        ...,
        description=(
            'Rating "İyi" ise boş string. '
            "Diğer durumlarda spesifik ve uygulanabilir gelişim önerisi."
        ),
    )


class LessonStructureItem(BaseModel):
    """One structural step (Isınma, Kapanış, …) and whether it occurred."""

    item: str
    completed: bool


# --------------------------------------------------------------------------- #
#  Root report
# --------------------------------------------------------------------------- #
class QAReport(BaseModel):
    """Full pedagogical QA report for a single lecture."""

    video_id: str

    # ----- Meta -----------------------------------------------------------
    instructor_name: str = ""
    course: str = ""
    group: str = ""
    lesson_date: str = ""
    module: int = 0
    lesson_number: int = 0
    expected_duration_min: int = 0
    actual_duration_min: int = 0
    speaking_time_rating: str = Field(
        default="satisfactory",
        description='"satisfactory" | "too_much" | "too_little".',
    )

    # ----- Categorised metrics -------------------------------------------
    iletisim: Dict[str, MetricResult] = Field(default_factory=dict)
    # expected keys: ders_dinamikleri, mod_tutum, saygi_sinirlar,
    # tesvik_motivasyon, hatalar, acik_uclu_sorular,
    # empati_destekleyici, etik_degerler

    hazirlik: Dict[str, MetricResult] = Field(default_factory=dict)
    # expected keys: ders_akisi_tempo, konu_bilgisi,
    # aciklama_netligi, rasyonel_ipucu

    organizasyon: Dict[str, MetricResult] = Field(default_factory=dict)
    # expected keys: gorsel_bilesenler, konusma_ses_tonu,
    # teknik_bilesen, zamanlama

    ders_yapisi: List[LessonStructureItem] = Field(default_factory=list)
    # items: Isınma, Önceki dersin gözden geçirilmesi,
    # Önceki ödevin tartışılması, Hedefler ve beklenen sonuç,
    # Özet, Gelecek ödevin tartışılması, Kapanış

    # ----- Overall -------------------------------------------------------
    genel_sonuc: str = Field(
        default="Beklentilere uygundu.",
        description=(
            '"Beklentilere uygundu." | "Beklentilerin altında." | '
            '"Beklentilerin üzerinde."'
        ),
    )
    yeterlilikler: Rating = Rating.acceptable
    stop_faktor: int = 0

    # ----- Free-form feedback -------------------------------------------
    feedback_metni: str = Field(
        default="",
        description="Turkish 3-4 paragraph feedback, warm professional tone.",
    )

    # ----- Independent quality review (OpenRouter, optional) ------------
    quality_score: Optional[int] = None
    quality_passed: Optional[bool] = None
    quality_issues: Optional[List[str]] = None

    generated_at: datetime
