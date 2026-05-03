import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.generate_pdf import render_qa_report_pdf
from google.cloud import storage
from src.audio.schemas import (
    AudioAnalysisResult,
    TranscriptSegment,
    build_sentiment_summary,
)
from src.config import BucketConfig
from src.env_bootstrap import load_dotenv_files
from src.orchestrator.gemini_client import ReportOrchestrator

DEFAULT_VIDEO_ID = "TUR40W245_TUE-18_8-9(M1L1)"


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Regenerate QA report + optional local PDF (smoke test).")
    p.add_argument(
        "--video-id",
        default=DEFAULT_VIDEO_ID,
        help=f"GCS paths use this id (default: {DEFAULT_VIDEO_ID!r})",
    )
    p.add_argument(
        "--output",
        "-o",
        metavar="PATH",
        help="Write PDF to this path after report generation.",
    )
    p.add_argument(
        "--use-gcs-audio",
        action="store_true",
        help=(
            "Load AudioAnalysisResult from gs://{processed}/data/audio/{video_id}.json "
            "(real transcript + duration). Same as production: ReportOrchestrator also loads "
            "metadata from gs://{processed}/metadata/{video_id}.json when present (UTF-8 BOM ok)."
        ),
    )
    p.add_argument(
        "--diagnostics",
        action="store_true",
        help="Print segment count, max segment end, derived minutes, chunk estimate.",
    )
    return p.parse_args()


def _load_audio_from_gcs(video_id: str, buckets: BucketConfig) -> AudioAnalysisResult:
    path = buckets.processed_audio_json_key.format(video_id=video_id)
    client = storage.Client()
    blob = client.bucket(buckets.processed).blob(path)
    payload = blob.download_as_text()
    return AudioAnalysisResult.model_validate_json(payload)


def _print_diagnostics(
    audio_result: AudioAnalysisResult, chunk_minutes: int
) -> None:
    n = len(audio_result.segments)
    ends = [int(s.end_ms) for s in audio_result.segments]
    max_end = max(ends) if ends else 0
    dur_ms = getattr(audio_result, "duration_ms", None)
    chunk_sec = max(60, chunk_minutes * 60)
    audio_sec = max(max_end // 1000, (int(dur_ms) // 1000) if dur_ms else 0)
    est_chunks = max(1, (audio_sec + chunk_sec - 1) // chunk_sec)
    derived_min = max(1, max_end // 60000) if max_end else 1
    if isinstance(dur_ms, (int, float)) and dur_ms > 0:
        derived_min = max(derived_min, max(1, int(dur_ms) // 60000))
    print(
        "DIAG segments=",
        n,
        " max_end_ms=",
        max_end,
        " max_end_min=",
        round(max_end / 60000, 2) if max_end else 0,
        " duration_ms=",
        dur_ms,
        " derived_duration_min_for_stub=",
        derived_min,
        " est_chunks_approx=",
        est_chunks,
        sep="",
        flush=True,
    )


async def main() -> None:
    args = _parse_args()
    video_id = args.video_id.strip()
    load_dotenv_files(ROOT)
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s %(message)s",
    )
    buckets = BucketConfig.from_env()
    raw_order = (os.environ.get("ORCHESTRATOR_PROVIDER_ORDER") or "").strip()
    if raw_order:
        provider_order = tuple(
            p.strip().lower() for p in raw_order.split(",") if p.strip()
        )
    elif (os.environ.get("GEMINI_API_KEY") or "").strip():
        provider_order = ("aistudio", "groq")
    else:
        provider_order = ("gemini", "groq")
    degraded = (os.environ.get("ORCHESTRATOR_DEGRADED_FALLBACK") or "").strip().lower()
    spacing_raw = (os.environ.get("ORCHESTRATOR_LLM_SPACING_SEC") or "").strip()
    try:
        llm_spacing_sec = float(spacing_raw) if spacing_raw else 0.0
    except ValueError:
        llm_spacing_sec = 0.0
    orchestrator = ReportOrchestrator(
        gemini_api_key=os.environ.get("GEMINI_API_KEY"),
        groq_api_key=os.environ.get("GROQ_API_KEY"),
        groq_extra_api_key=os.environ.get("GROQ_EKSTRA"),
        openrouter_api_key=(os.environ.get("OPENROUTER_API_KEY") or "").strip()
        or None,
        openrouter_model=(os.environ.get("OPENROUTER_MODEL") or "").strip() or None,
        quality_agent_model=(os.environ.get("QUALITY_AGENT_MODEL") or "").strip()
        or None,
        buckets=buckets,
        google_cloud_project=os.environ.get("GOOGLE_CLOUD_PROJECT"),
        gemini_provider=os.environ.get("GEMINI_PROVIDER", "vertex"),
        vertex_location=os.environ.get("VERTEX_LOCATION", "us-central1"),
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-1.5-flash"),
        groq_model=os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
        provider_order=provider_order if provider_order else ("gemini", "groq"),
        chunk_minutes=int(os.environ.get("CHUNK_MINUTES", "60")),
        degraded_fallback=degraded in {"1", "true", "yes", "on"},
        llm_spacing_sec=llm_spacing_sec,
    )
    chunk_minutes = orchestrator.chunk_minutes

    if args.use_gcs_audio:
        audio_result = _load_audio_from_gcs(video_id, buckets)
    else:
        segments = [
            TranscriptSegment(
                speaker="A",
                start_ms=0,
                end_ms=120000,
                text="Dersin acilisi ve ogrenci etkilesimi",
                sentiment="POSITIVE",
                sentiment_confidence=0.9,
            ),
            TranscriptSegment(
                speaker="A",
                start_ms=130000,
                end_ms=300000,
                text="Ogretmen aciklayici ve destekleyici bir dil kullaniyor",
                sentiment="NEUTRAL",
                sentiment_confidence=0.8,
            ),
        ]
        audio_result = AudioAnalysisResult(
            video_id=video_id,
            full_transcript=(
                "Dersin acilisi ve ogrenci etkilesimi. "
                "Ogretmen aciklayici ve destekleyici bir dil kullaniyor."
            ),
            segments=segments,
            highlights=["ogrenci etkilesimi", "aciklayici dil"],
            speaking_pace_wpm=142.0,
            silence_ratio=0.12,
            sentiment_summary=build_sentiment_summary(segments),
            processed_at=datetime.now(timezone.utc),
        )

    if args.diagnostics:
        _print_diagnostics(audio_result, chunk_minutes)
        if not args.use_gcs_audio:
            print(
                "DIAG note: using in-script stub audio (2 short segments). "
                "Use --use-gcs-audio for gs://.../data/audio/{video_id}.json",
                flush=True,
            )

    report = await orchestrator.generate_report(video_id, audio_result)
    qs = getattr(report, "quality_score", None)
    if qs is not None:
        print(
            "QUALITY_SUMMARY",
            qs,
            getattr(report, "quality_passed", None),
            flush=True,
        )
    print(
        "REPORT_OK",
        report.video_id,
        report.instructor_name,
        report.course,
        report.module,
        report.lesson_number,
        report.group,
        report.yeterlilikler.value,
        report.stop_faktor,
        report.genel_sonuc,
    )
    print("FEEDBACK_HEAD", report.feedback_metni[:320].replace("\n", " "))
    if args.output:
        out = Path(args.output).expanduser().resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(render_qa_report_pdf(report))
        print("PDF_LOCAL", out)


if __name__ == "__main__":
    asyncio.run(main())
