from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

from google.api_core import exceptions as gcp_exceptions
from google.cloud import storage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.config import BucketConfig
from src.env_bootstrap import load_dotenv_files
from src.orchestrator.report_schema import QAReport, Rating

HEADER_BLUE = colors.HexColor("#1E63D5")
LIGHT_BLUE = colors.HexColor("#DCEAFE")
GRID_BLUE = colors.HexColor("#9FC5F8")
GOOD_GREEN = colors.HexColor("#22C55E")
WARN_ORANGE = colors.HexColor("#F59E0B")
BAD_RED = colors.HexColor("#EF4444")
SOFT_GRAY = colors.HexColor("#F3F4F6")
TEXT_GRAY = colors.HexColor("#374151")
TIP_ORANGE = colors.HexColor("#CC6600")

REPORTS_PREFIX = "reports/"
PDFS_PREFIX = "pdfs/"

ILETISIM_LABELS = {
    "ders_dinamikleri": "Ders dinamikleri",
    "mod_tutum": "Mod & Tutum",
    "saygi_sinirlar": "Saygı ve sınırlar",
    "tesvik_motivasyon": "Teşvik & Motivasyon",
    "hatalar": "Hatalar",
    "acik_uclu_sorular": "Açık uçlu sorular",
    "empati_destekleyici": "Empati & Destekleyici tutum",
    "etik_degerler": "Etik Değerler",
}
HAZIRLIK_LABELS = {
    "ders_akisi_tempo": "Ders akışı & Tempo",
    "konu_bilgisi": "Konu bilgisi",
    "aciklama_netligi": "Açıklama netliği",
    "rasyonel_ipucu": "Rasyonel & İpucu",
}
ORGANIZASYON_LABELS = {
    "gorsel_bilesenler": "Görsel Bileşenler",
    "konusma_ses_tonu": "Konuşma & Ses tonu",
    "teknik_bilesen": "Teknik bileşen",
    "zamanlama": "Zamanlama",
}


def _register_fonts() -> Tuple[str, str]:
    """Register DejaVu (bundled under assets/fonts/ or system) for Turkish Unicode text."""
    candidates: list[tuple[Path, Path]] = [
        (
            ROOT / "assets" / "fonts" / "DejaVuSans.ttf",
            ROOT / "assets" / "fonts" / "DejaVuSans-Bold.ttf",
        ),
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ),
    ]
    for regular_path, bold_path in candidates:
        if regular_path.is_file() and bold_path.is_file():
            pdfmetrics.registerFont(TTFont("DejaVu", str(regular_path)))
            pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(bold_path)))
            return "DejaVu", "DejaVu-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT_REGULAR, FONT_BOLD = _register_fonts()


def _rating_color(value: str) -> colors.Color:
    if value == Rating.good.value:
        return GOOD_GREEN
    if value == Rating.acceptable.value:
        return WARN_ORANGE
    if value == Rating.poor.value:
        return BAD_RED
    return colors.HexColor("#9CA3AF")


def _safe_text(value: object) -> str:
    text = str(value or "-")
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _extract_group(video_id: str) -> str:
    return video_id.split("_", 1)[0] if "_" in video_id else video_id


def _speaking_time_label(value: str) -> str:
    mapping = {
        "satisfactory": "Yeterli",
        "too_much": "Fazla",
        "too_little": "Az",
    }
    return mapping.get((value or "").strip().lower(), value or "-")


def _summary_structure(report: QAReport) -> str:
    total = len(report.ders_yapisi)
    done = sum(1 for item in report.ders_yapisi if item.completed)
    return f"{done}/{total}" if total else "-"


def _styles() -> Dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "section": ParagraphStyle(
            "section",
            parent=base["Heading2"],
            fontName=FONT_BOLD,
            fontSize=14,
            leading=18,
            textColor=HEADER_BLUE,
            spaceAfter=6,
            spaceBefore=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=9,
            leading=12,
            textColor=TEXT_GRAY,
            alignment=TA_LEFT,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=8,
            leading=10,
            textColor=TEXT_GRAY,
        ),
        "small_bold": ParagraphStyle(
            "small_bold",
            parent=base["BodyText"],
            fontName=FONT_BOLD,
            fontSize=8,
            leading=10,
            textColor=TEXT_GRAY,
        ),
        "feedback": ParagraphStyle(
            "feedback",
            parent=base["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=11,
            leading=16,
            textColor=TEXT_GRAY,
            spaceAfter=8,
        ),
        "improvement_tip": ParagraphStyle(
            "improvement_tip",
            parent=base["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=8,
            leading=10,
            textColor=TIP_ORANGE,
        ),
    }


def _meta_rows(report: QAReport) -> list[list[str]]:
    group = _extract_group(report.video_id)
    course = group[:3] if len(group) >= 3 else group
    return [
        [
            "Eğitmen ID",
            report.video_id,
            "Kurs",
            course or "-",
        ],
        [
            "Eğitmenin adı",
            report.instructor_name or "-",
            "Modül",
            str(report.module or "-"),
        ],
        [
            "Ders tarihi",
            report.lesson_date or "-",
            "Ders",
            str(report.lesson_number or "-"),
        ],
        [
            "Grup",
            group or "-",
            "Kayıt",
            report.video_id,
        ],
        [
            "BO link",
            "-",
            "Materyaller",
            "-",
        ],
    ]


def _summary_rows(report: QAReport) -> list[list[str]]:
    date_value = (
        report.generated_at.strftime("%Y-%m-%d")
        if report.generated_at
        else "-"
    )
    return [
        [
            "Değerlendirme tarihi",
            "Genel sonuc",
            "Yapı",
            "Değerlendiren",
            "Yeterlilikler",
            "Stop faktor",
        ],
        [
            date_value,
            report.genel_sonuc or "-",
            _summary_structure(report),
            "AI QA Pipeline",
            report.yeterlilikler.value,
            str(report.stop_faktor),
        ],
    ]


def _metric_observation_cell(
    metric: object,
    styles: Dict[str, ParagraphStyle],
) -> Paragraph | list:
    """Observation paragraph, optionally stacked with improvement tip (dynamic height)."""
    observation = getattr(metric, "observation", "") or "-"
    obs_para = Paragraph(_safe_text(observation), styles["small"])
    tip_raw = (getattr(metric, "improvement_tip", None) or "").strip()
    if not tip_raw:
        return obs_para
    tip_html = (
        "<b><i>Gelişim önerisi: </i></b>"
        f"<i>{_safe_text(tip_raw)}</i>"
    )
    return [
        obs_para,
        Spacer(1, 2),
        Paragraph(tip_html, styles["improvement_tip"]),
    ]


def _metric_group_table(
    title: str,
    label_map: Dict[str, str],
    values: Dict[str, object],
    styles: Dict[str, ParagraphStyle],
) -> Table:
    rows = [[title, "", ""]]
    ratings: list[str] = []
    for key, label in label_map.items():
        metric = values.get(key)
        rating = getattr(metric, "rating", Rating.na)
        rating_text = rating.value if hasattr(rating, "value") else str(rating)
        rows.append(
            [
                Paragraph(_safe_text(label), styles["small"]),
                Paragraph(_safe_text(rating_text), styles["small_bold"]),
                _metric_observation_cell(metric, styles),
            ]
        )
        ratings.append(rating_text)

    table = Table(rows, colWidths=[55 * mm, 25 * mm, 100 * mm], repeatRows=1)
    style = TableStyle(
        [
            ("SPAN", (0, 0), (2, 0)),
            ("BACKGROUND", (0, 0), (2, 0), LIGHT_BLUE),
            ("FONTNAME", (0, 0), (2, 0), FONT_BOLD),
            ("FONTSIZE", (0, 0), (2, 0), 10),
            ("TEXTCOLOR", (0, 0), (2, 0), HEADER_BLUE),
            ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLUE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )
    for idx, rating_text in enumerate(ratings, start=1):
        style.add("BACKGROUND", (1, idx), (1, idx), _rating_color(rating_text))
        style.add("TEXTCOLOR", (1, idx), (1, idx), colors.white)
    table.setStyle(style)
    return table


def _lesson_structure_table(
    report: QAReport,
    styles: Dict[str, ParagraphStyle],
) -> Table:
    rows = [["Ders Yapısı", "", ""]]
    statuses: list[bool] = []
    for item in report.ders_yapisi:
        status = bool(item.completed)
        mark = "[x]" if status else "[ ]"
        rows.append(
            [
                Paragraph(_safe_text(f"{mark} {item.item}"), styles["small"]),
                Paragraph(
                    _safe_text("Tamamlandı" if status else "Gözlemlenmedi"),
                    styles["small_bold"],
                ),
                Paragraph(
                    _safe_text(
                        "Ders akışında yer aldı"
                        if status
                        else "Bu yapısal adım gözlemlenmedi"
                    ),
                    styles["small"],
                ),
            ]
        )
        statuses.append(status)

    table = Table(rows, colWidths=[55 * mm, 25 * mm, 100 * mm], repeatRows=1)
    style = TableStyle(
        [
            ("SPAN", (0, 0), (2, 0)),
            ("BACKGROUND", (0, 0), (2, 0), LIGHT_BLUE),
            ("FONTNAME", (0, 0), (2, 0), FONT_BOLD),
            ("FONTSIZE", (0, 0), (2, 0), 10),
            ("TEXTCOLOR", (0, 0), (2, 0), HEADER_BLUE),
            ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLUE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )
    for idx, done in enumerate(statuses, start=1):
        style.add(
            "BACKGROUND",
            (1, idx),
            (1, idx),
            GOOD_GREEN if done else WARN_ORANGE,
        )
        style.add("TEXTCOLOR", (1, idx), (1, idx), colors.white)
    table.setStyle(style)
    return table


def _header(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(HEADER_BLUE)
    canvas.rect(0, height - 28 * mm, width, 28 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont(FONT_BOLD, 18)
    canvas.drawString(15 * mm, height - 18 * mm, "QA Raporu")
    canvas.setFont(FONT_BOLD, 16)
    logo_text = "kodland"
    canvas.drawRightString(width - 15 * mm, height - 18 * mm, logo_text)
    canvas.restoreState()


def render_qa_report_pdf(report: QAReport) -> bytes:
    styles = _styles()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=35 * mm,
        bottomMargin=12 * mm,
    )

    story = []
    story.append(Spacer(1, 2 * mm))

    meta_rows = [
        [
            Paragraph(_safe_text(label1), styles["small_bold"]),
            Paragraph(_safe_text(value1), styles["small"]),
            Paragraph(_safe_text(label2), styles["small_bold"]),
            Paragraph(_safe_text(value2), styles["small"]),
        ]
        for label1, value1, label2, value2 in _meta_rows(report)
    ]
    meta_table = Table(
        meta_rows,
        colWidths=[28 * mm, 55 * mm, 24 * mm, 58 * mm],
    )
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLUE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("BACKGROUND", (0, 0), (0, -1), SOFT_GRAY),
                ("BACKGROUND", (2, 0), (2, -1), SOFT_GRAY),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 4 * mm))

    summary_rows = [
        [Paragraph(_safe_text(v), styles["small_bold"]) for v in _summary_rows(report)[0]],
        [Paragraph(_safe_text(v), styles["small"]) for v in _summary_rows(report)[1]],
    ]
    summary_table = Table(
        summary_rows,
        colWidths=[28 * mm, 38 * mm, 16 * mm, 30 * mm, 28 * mm, 18 * mm],
    )
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HEADER_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLUE),
                ("BACKGROUND", (0, 1), (-1, 1), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("Öğretim Yeterlilikleri", styles["section"]))
    story.append(
        _metric_group_table("İletişim", ILETISIM_LABELS, report.iletisim, styles)
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        _metric_group_table("Hazırlık", HAZIRLIK_LABELS, report.hazirlik, styles)
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        _metric_group_table(
            "Organizasyon",
            ORGANIZASYON_LABELS,
            report.organizasyon,
            styles,
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(_lesson_structure_table(report, styles))
    story.append(Spacer(1, 5 * mm))

    bottom_bar = Table(
        [
            [
                Paragraph("Beklenen süre", styles["small_bold"]),
                Paragraph("Gerçekleşen süre", styles["small_bold"]),
                Paragraph("Eğitmenin konuşma süresi", styles["small_bold"]),
            ],
            [
                Paragraph(f"{report.expected_duration_min} dk", styles["small"]),
                Paragraph(f"{report.actual_duration_min} dk", styles["small"]),
                Paragraph(
                    _safe_text(_speaking_time_label(report.speaking_time_rating)),
                    styles["small"],
                ),
            ],
        ],
        colWidths=[55 * mm, 55 * mm, 65 * mm],
    )
    bottom_bar.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HEADER_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLUE),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(bottom_bar)

    story.append(PageBreak())
    story.append(Paragraph("Geri Bildirim", styles["section"]))
    paragraphs = [
        p.strip()
        for p in (report.feedback_metni or "").split("\n\n")
        if p.strip()
    ]
    if not paragraphs:
        paragraphs = ["Geri bildirim metni bulunamadı."]
    for paragraph in paragraphs:
        story.append(Paragraph(_safe_text(paragraph).replace("\n", "<br/>"), styles["feedback"]))

    doc.build(story, onFirstPage=_header, onLaterPages=_header)
    return buffer.getvalue()


def report_blob_path(video_id: str) -> str:
    return f"{REPORTS_PREFIX}{video_id}.json"


def pdf_blob_path(video_id: str) -> str:
    return f"{PDFS_PREFIX}{video_id}.pdf"


def load_report_from_gcs(
    storage_client: storage.Client,
    *,
    bucket_name: str,
    video_id: str,
) -> QAReport:
    blob = storage_client.bucket(bucket_name).blob(report_blob_path(video_id))
    payload = blob.download_as_text()
    return QAReport.model_validate_json(payload)


def upload_pdf_to_gcs(
    storage_client: storage.Client,
    *,
    bucket_name: str,
    video_id: str,
    pdf_bytes: bytes,
) -> str:
    blob = storage_client.bucket(bucket_name).blob(pdf_blob_path(video_id))
    try:
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")
    except gcp_exceptions.Forbidden as exc:
        msg = str(exc)
        if "storage.objects.delete" in msg or "does not have storage.objects" in msg:
            raise gcp_exceptions.Forbidden(
                f"{msg}\n\n"
                "Replacing an existing PDF in GCS requires permission to delete/overwrite "
                "objects (e.g. roles/storage.objectAdmin or storage.objects.delete on the bucket). "
                "Alternatively, write the file locally only:\n"
                f'  python -m scripts.generate_pdf --video-id "{video_id}" --output pdfs\\{video_id}.pdf'
            ) from exc
        raise
    return f"gs://{bucket_name}/{pdf_blob_path(video_id)}"


def generate_pdf_for_video_id(
    *,
    storage_client: storage.Client,
    bucket_name: str,
    video_id: str,
    report: Optional[QAReport] = None,
) -> str:
    report_obj = report or load_report_from_gcs(
        storage_client,
        bucket_name=bucket_name,
        video_id=video_id,
    )
    pdf_bytes = render_qa_report_pdf(report_obj)
    return upload_pdf_to_gcs(
        storage_client,
        bucket_name=bucket_name,
        video_id=video_id,
        pdf_bytes=pdf_bytes,
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate QAReport PDF from GCS JSON.")
    parser.add_argument("--video-id", required=True)
    parser.add_argument(
        "--output",
        "-o",
        metavar="PATH",
        help="Write the PDF to this path and skip GCS upload (no storage.objects.delete needed).",
    )
    return parser.parse_args()


def main() -> None:
    load_dotenv_files(ROOT)
    args = _parse_args()
    storage_client = storage.Client()
    buckets = BucketConfig.from_env()
    bucket_name = buckets.processed
    report = load_report_from_gcs(
        storage_client,
        bucket_name=bucket_name,
        video_id=args.video_id,
    )
    pdf_bytes = render_qa_report_pdf(report)
    if args.output:
        out_path = Path(args.output).expanduser().resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(pdf_bytes)
        print(out_path)
        return
    pdf_uri = upload_pdf_to_gcs(
        storage_client,
        bucket_name=bucket_name,
        video_id=args.video_id,
        pdf_bytes=pdf_bytes,
    )
    print(pdf_uri)


if __name__ == "__main__":
    main()
