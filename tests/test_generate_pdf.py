from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

from src.orchestrator.report_schema import (
    LessonStructureItem,
    MetricResult,
    QAReport,
    Rating,
)
from scripts.generate_pdf import generate_pdf_for_video_id, render_qa_report_pdf


def _metric(rating: Rating, observation: str) -> MetricResult:
    return MetricResult(
        rating=rating,
        observation=observation,
        improvement_tip="" if rating == Rating.good else "Improve this",
    )


def _report() -> QAReport:
    return QAReport(
        video_id="vid-1",
        instructor_name="Ali Hoca",
        lesson_date="2026-04-19",
        module=2,
        lesson_number=5,
        expected_duration_min=60,
        actual_duration_min=58,
        speaking_time_rating="satisfactory",
        iletisim={
            "ders_dinamikleri": _metric(Rating.good, "(00:10) good"),
            "mod_tutum": _metric(Rating.acceptable, "(00:20) okay"),
            "saygi_sinirlar": _metric(Rating.good, "(00:30) good"),
            "tesvik_motivasyon": _metric(Rating.good, "(00:40) good"),
            "hatalar": _metric(Rating.acceptable, "(00:50) okay"),
            "acik_uclu_sorular": _metric(Rating.good, "(01:00) good"),
            "empati_destekleyici": _metric(Rating.good, "(01:10) good"),
            "etik_degerler": _metric(Rating.good, "(01:20) good"),
        },
        hazirlik={
            "ders_akisi_tempo": _metric(Rating.good, "(01:30) good"),
            "konu_bilgisi": _metric(Rating.good, "(01:40) good"),
            "aciklama_netligi": _metric(Rating.acceptable, "(01:50) okay"),
            "rasyonel_ipucu": _metric(Rating.good, "(02:00) good"),
        },
        organizasyon={
            "gorsel_bilesenler": _metric(Rating.good, "(02:10) good"),
            "konusma_ses_tonu": _metric(Rating.good, "(02:20) good"),
            "teknik_bilesen": _metric(Rating.acceptable, "(02:30) okay"),
            "zamanlama": _metric(Rating.good, "(02:40) good"),
        },
        ders_yapisi=[
            LessonStructureItem(item="Isinma", completed=True),
            LessonStructureItem(item="Ozet", completed=False),
        ],
        genel_sonuc="Beklentilere uygundu.",
        yeterlilikler=Rating.acceptable,
        stop_faktor=1,
        feedback_metni="Merhaba Hocam,\n\nGenel olarak ders akisiniz olumluydu.",
        generated_at=datetime.now(timezone.utc),
    )


def test_render_qa_report_pdf_returns_pdf_bytes():
    pdf_bytes = render_qa_report_pdf(_report())
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 1000


def test_generate_pdf_for_video_id_uploads_to_expected_blob():
    storage_client = MagicMock()
    bucket = MagicMock()
    blob = MagicMock()
    storage_client.bucket.return_value = bucket
    bucket.blob.return_value = blob

    uri = generate_pdf_for_video_id(
        storage_client=storage_client,
        bucket_name="lectureai_processed",
        video_id="vid-1",
        report=_report(),
    )

    bucket.blob.assert_called_once_with("pdfs/vid-1.pdf")
    upload_args = blob.upload_from_string.call_args.args
    assert upload_args[0].startswith(b"%PDF")
    assert (
        blob.upload_from_string.call_args.kwargs["content_type"]
        == "application/pdf"
    )
    assert uri == "gs://lectureai_processed/pdfs/vid-1.pdf"
