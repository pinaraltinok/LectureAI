"""Shared configuration models for the audio + orchestrator modules.

`BucketConfig` is the single source of truth for every GCS location
the pipeline touches. Pass one instance to both
`AudioAnalysisClient` and `ReportOrchestrator`.

Loadable from environment variables:

    GCS_BUCKET_VIDEOS        = lectureai_full_videos
    GCS_FULL_VIDEOS_BUCKET   = lectureai_full_videos  (alias for pipeline CLI)
    GCS_BUCKET_PROCESSED     = lectureai_processed
    GCS_BUCKET_TRANSCRIPTS   = lectureai_transcripts
    GCS_BUCKET_AUDIO         = lectureai_audio
    GCS_BUCKET_AUDIO_CHUNKS  = lectureai_audio_chunks   (optional)

Object-key templates can be overridden through the same env vars
(e.g. `GCS_KEY_CV=my/custom/{video_id}.json`) but sane defaults are
provided so the FastAPI developer does not have to set them.

Audio analysis JSON and human transcript text are stored under the
**processed** bucket (see ``processed_audio_json_key`` and
``processed_transcript_txt_key``).
"""

from __future__ import annotations

import os
from typing import Optional

from pydantic import BaseModel, Field


class BucketConfig(BaseModel):
    """Which bucket + key template to use for every GCS operation."""

    # ---- bucket names --------------------------------------------------
    videos: str = Field(..., description="Bucket holding input .mp4 files.")
    processed: str = Field(
        ..., description="Bucket for CV JSON (input) and final reports (output)."
    )
    transcripts: str = Field(
        ..., description="Bucket where audio-analysis JSON is persisted."
    )
    audio: str = Field(
        ..., description="Bucket where extracted .mp3 files are persisted."
    )
    audio_chunks: Optional[str] = Field(
        default=None,
        description="Bucket for chunked mp3 segments (optional).",
    )

    # ---- object key templates -----------------------------------------
    video_key: str = Field(default="Lesson_Records/{video_id}.mp4")
    cv_key: str = Field(default="results/{video_id}.json")
    audio_json_key: str = Field(default="{video_id}.json")
    report_key: str = Field(default="reports/{video_id}.json")
    mp3_key: str = Field(default="{video_id}.mp3")
    processed_audio_json_key: str = Field(
        default="data/audio/{video_id}.json",
        description="Full AudioAnalysisResult JSON under the processed bucket.",
    )
    processed_transcript_txt_key: str = Field(
        default="transcripts/{video_id}.txt",
        description="Human-readable transcript .txt under the processed bucket.",
    )

    # ------------------------------------------------------------------ #
    #  Factories
    # ------------------------------------------------------------------ #
    @classmethod
    def from_env(cls) -> "BucketConfig":
        """Build a `BucketConfig` from environment variables.

        Raises
        ------
        RuntimeError
            If any mandatory bucket env var is missing.
        """
        required = {
            "videos": "GCS_BUCKET_VIDEOS",
            "processed": "GCS_BUCKET_PROCESSED",
            "transcripts": "GCS_BUCKET_TRANSCRIPTS",
            "audio": "GCS_BUCKET_AUDIO",
        }
        values = {}
        missing = []
        for field, env_var in required.items():
            if field == "videos":
                val = (
                    os.environ.get("GCS_FULL_VIDEOS_BUCKET")
                    or os.environ.get(env_var)
                )
            else:
                val = os.environ.get(env_var)
            if not val:
                missing.append(env_var)
            else:
                values[field] = val
        if missing:
            raise RuntimeError(
                "Missing required GCS bucket env vars: "
                + ", ".join(missing)
            )

        values["audio_chunks"] = os.environ.get("GCS_BUCKET_AUDIO_CHUNKS") or None

        for field, env_var in {
            "video_key": "GCS_KEY_VIDEO",
            "cv_key": "GCS_KEY_CV",
            "audio_json_key": "GCS_KEY_AUDIO_JSON",
            "report_key": "GCS_KEY_REPORT",
            "mp3_key": "GCS_KEY_MP3",
            "processed_audio_json_key": "GCS_KEY_PROCESSED_AUDIO_JSON",
            "processed_transcript_txt_key": "GCS_KEY_PROCESSED_TRANSCRIPT_TXT",
        }.items():
            override = os.environ.get(env_var)
            if override:
                values[field] = override

        return cls(**values)

    # ------------------------------------------------------------------ #
    #  Key helpers
    # ------------------------------------------------------------------ #
    def video_path(self, video_id: str) -> str:
        return self.video_key.format(video_id=video_id)

    def cv_path(self, video_id: str) -> str:
        return self.cv_key.format(video_id=video_id)

    def audio_json_path(self, video_id: str) -> str:
        return self.audio_json_key.format(video_id=video_id)

    def report_path(self, video_id: str) -> str:
        return self.report_key.format(video_id=video_id)

    def mp3_path(self, video_id: str) -> str:
        return self.mp3_key.format(video_id=video_id)

    def processed_audio_json_path(self, video_id: str) -> str:
        return self.processed_audio_json_key.format(video_id=video_id)

    def processed_transcript_txt_path(self, video_id: str) -> str:
        return self.processed_transcript_txt_key.format(video_id=video_id)
