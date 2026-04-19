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
    orchestrator = ReportOrchestrator(
        gemini_api_key=os.environ["GEMINI_API_KEY"],
        buckets=buckets,
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
