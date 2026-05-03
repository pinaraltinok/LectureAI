import asyncio
import argparse
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from google.cloud import storage

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.audio.assemblyai_client import AudioAnalysisClient
from src.config import BucketConfig
from src.env_bootstrap import load_dotenv_files
from src.orchestrator.gemini_client import ReportOrchestrator
from scripts.generate_pdf import generate_pdf_for_video_id


PROCESSED_BUCKET = "lectureai_processed"
FULL_VIDEOS_BUCKET = "lectureai_full_videos"
VIDEOS_PREFIX = "Lesson_Records/"
REPORTS_PREFIX = "reports/"
MAX_CONCURRENCY = 3

@dataclass
class PipelineResult:
    video_id: str
    status: str  # processed | skipped | failed
    error: Optional[str] = None


def _is_excluded_video_id(video_id: str) -> bool:
    lowered = video_id.lower()
    return (
        lowered.startswith("test_")
        or lowered == "test_trigger"
        or "debug" in lowered
    )


def _full_videos_bucket_name() -> str:
    return (
        os.environ.get("GCS_FULL_VIDEOS_BUCKET")
        or os.environ.get("GCS_BUCKET_VIDEOS")
        or FULL_VIDEOS_BUCKET
    )


def _discover_video_ids(storage_client: storage.Client) -> List[str]:
    """List gs://{full_videos_bucket}/Lesson_Records/*.mp4 and return video_ids."""
    bucket_name = _full_videos_bucket_name()
    bucket = storage_client.bucket(bucket_name)
    blobs = list(bucket.list_blobs(prefix=VIDEOS_PREFIX))

    video_ids = set()
    # Canonical layout: Lesson_Records/{video_id}.mp4
    for blob in blobs:
        object_name = blob.name
        if not object_name.startswith(VIDEOS_PREFIX):
            continue
        if not object_name.lower().endswith(".mp4"):
            continue
        filename = object_name.rsplit("/", 1)[-1]
        video_id = filename[:-4]  # strip ".mp4"
        if video_id:
            video_ids.add(video_id)

    return sorted(video_ids)


async def _report_exists(
    storage_client: storage.Client,
    video_id: str,
) -> bool:
    blob = storage_client.bucket(PROCESSED_BUCKET).blob(
        f"{REPORTS_PREFIX}{video_id}.json"
    )
    return await asyncio.to_thread(blob.exists)


async def _process_video(
    video_id: str,
    *,
    semaphore: asyncio.Semaphore,
    storage_client: storage.Client,
    audio: AudioAnalysisClient,
    orchestrator: ReportOrchestrator,
) -> PipelineResult:
    async with semaphore:
        try:
            if await _report_exists(storage_client, video_id):
                print(f"[SKIP] {video_id} - report already exists")
                return PipelineResult(video_id=video_id, status="skipped")

            audio_result = await audio.analyze(video_id)
            report = await orchestrator.generate_report(video_id, audio_result)
            await asyncio.to_thread(
                generate_pdf_for_video_id,
                storage_client=storage_client,
                bucket_name=PROCESSED_BUCKET,
                video_id=video_id,
                report=report,
            )
            print(f"[DONE] {video_id}")
            return PipelineResult(video_id=video_id, status="processed")
        except Exception as exc:  # pragma: no cover - integration path
            print(f"[FAIL] {video_id}: {exc}")
            return PipelineResult(
                video_id=video_id,
                status="failed",
                error=str(exc),
            )


async def _dry_run_video(
    video_id: str,
    *,
    semaphore: asyncio.Semaphore,
    storage_client: storage.Client,
) -> PipelineResult:
    async with semaphore:
        exists = await _report_exists(storage_client, video_id)
        if exists:
            print(f"[WOULD SKIP]    {video_id}")
            return PipelineResult(video_id=video_id, status="skipped")

        print(f"[WOULD PROCESS] {video_id}")
        return PipelineResult(video_id=video_id, status="processed")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Batch run audio + report pipeline from GCS videos.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be processed/skipped without running APIs.",
    )
    return parser.parse_args()


async def main() -> None:
    load_dotenv_files(ROOT)

    args = _parse_args()
    # Keep stdout clean: only explicit `print(...)` lines from this script.
    logging.getLogger().handlers.clear()
    logging.getLogger().setLevel(logging.CRITICAL)

    storage_client = storage.Client()

    video_ids = await asyncio.to_thread(_discover_video_ids, storage_client)
    if not video_ids:
        if args.dry_run:
            print("Would process: 0 | Would skip: 0")
        else:
            print("Processed: 0 | Skipped: 0 | Failed: 0")
        return

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    missing = [
        key
        for key in ("ASSEMBLYAI_API_KEY", "GEMINI_API_KEY")
        if not os.environ.get(key)
    ]
    if not args.dry_run and missing:
        raise RuntimeError(
            "Missing required environment variables: " + ", ".join(missing)
        )

    buckets = BucketConfig.from_env()
    # Reports + CV live in processed; source mp4s live in full-videos bucket.
    buckets = buckets.model_copy(
        update={
            "videos": _full_videos_bucket_name(),
            "processed": PROCESSED_BUCKET,
            "video_key": "Lesson_Records/{video_id}.mp4",
            "report_key": "reports/{video_id}.json",
        }
    )

    filtered_video_ids: List[str] = []
    for video_id in video_ids:
        if _is_excluded_video_id(video_id):
            print(f"[EXCLUDED] {video_id} - matches test pattern")
            continue
        filtered_video_ids.append(video_id)
    video_ids = filtered_video_ids

    if not video_ids:
        if args.dry_run:
            print("Would process: 0 | Would skip: 0")
        else:
            print("Processed: 0 | Skipped: 0 | Failed: 0")
        return

    if args.dry_run:
        tasks = [
            _dry_run_video(
                video_id,
                semaphore=semaphore,
                storage_client=storage_client,
            )
            for video_id in video_ids
        ]
        results = await asyncio.gather(*tasks)
        would_process = [r for r in results if r.status == "processed"]
        would_skip = [r for r in results if r.status == "skipped"]
        print(
            f"Would process: {len(would_process)} | "
            f"Would skip: {len(would_skip)}"
        )
        return

    audio = AudioAnalysisClient(
        assemblyai_api_key=os.environ["ASSEMBLYAI_API_KEY"],
        buckets=buckets,
    )
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
    tasks = [
        _process_video(
            video_id,
            semaphore=semaphore,
            storage_client=storage_client,
            audio=audio,
            orchestrator=orchestrator,
        )
        for video_id in video_ids
    ]
    results = await asyncio.gather(*tasks)

    processed = [r for r in results if r.status == "processed"]
    skipped = [r for r in results if r.status == "skipped"]
    failed = [r for r in results if r.status == "failed"]

    print(
        f"Processed: {len(processed)} | "
        f"Skipped: {len(skipped)} | "
        f"Failed: {len(failed)}"
    )

    if failed:
        print("Failed videos:")
        for item in failed:
            print(f"- {item.video_id}: {item.error}")


if __name__ == "__main__":
    asyncio.run(main())
