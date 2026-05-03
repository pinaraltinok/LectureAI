import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.audio.schemas import (
    AudioAnalysisResult,
    TranscriptSegment,
    build_sentiment_summary,
)
from src.config import BucketConfig
from src.env_bootstrap import load_dotenv_files
from src.orchestrator.gemini_client import ReportOrchestrator


VIDEO_ID = "TUR40W245_TUE-18_8-9(M1L1)"


async def main() -> None:
    load_dotenv_files(ROOT)
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
        video_id=VIDEO_ID,
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

    report = await orchestrator.generate_report(VIDEO_ID, audio_result)
    print(
        "REPORT_OK",
        report.video_id,
        report.yeterlilikler.value,
        report.stop_faktor,
        report.genel_sonuc,
    )
    print("FEEDBACK_HEAD", report.feedback_metni[:200].replace("\n", " "))


if __name__ == "__main__":
    asyncio.run(main())
