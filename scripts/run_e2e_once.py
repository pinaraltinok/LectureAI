import asyncio
import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.audio.assemblyai_client import AudioAnalysisClient
from src.config import BucketConfig
from src.env_bootstrap import load_dotenv_files
from src.orchestrator.gemini_client import ReportOrchestrator


VIDEO_ID = "TUR40W245_TUE-18_8-9(M1L1)"


async def main() -> None:
    load_dotenv_files(ROOT)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    buckets = BucketConfig.from_env()
    audio = AudioAnalysisClient(
        assemblyai_api_key=os.environ["ASSEMBLYAI_API_KEY"],
        buckets=buckets,
    )
    orchestrator = ReportOrchestrator(
        gemini_api_key=os.environ["GEMINI_API_KEY"],
        buckets=buckets,
    )

    audio_result = await audio.analyze(VIDEO_ID)
    print(
        "AUDIO_OK",
        audio_result.video_id,
        len(audio_result.segments),
        audio_result.speaking_pace_wpm,
        audio_result.silence_ratio,
    )

    report = await orchestrator.generate_report(VIDEO_ID, audio_result)
    print("REPORT_OK", report.video_id, report.yeterlilikler.value, report.stop_faktor)


if __name__ == "__main__":
    asyncio.run(main())
