"""Typed environment for Cloud Run workers (Stage 1: audio, cv, orchestrator only).

Other packages keep using ``os.environ`` until migrated. Workers should call
``load_dotenv_files`` before instantiating these settings.
"""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AudioWorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    google_cloud_project: str = Field(default="senior-design-488908")
    gcs_bucket_name: str = Field(default="lectureai_processed", alias="GCS_BUCKET_NAME")
    gcs_full_videos_bucket: str = Field(default="lectureai_full_videos", alias="GCS_FULL_VIDEOS_BUCKET")
    assemblyai_api_key: str = Field(default="", alias="ASSEMBLYAI_API_KEY")
    worker_dry_run: bool = Field(default=False, alias="WORKER_DRY_RUN")
    backend_status_webhook: str = Field(default="", alias="BACKEND_STATUS_WEBHOOK")
    backend_status_webhook_bearer: str = Field(default="", alias="BACKEND_STATUS_WEBHOOK_BEARER")


class CvWorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    gcs_bucket_name: str = Field(default="lectureai_processed", alias="GCS_BUCKET_NAME")
    modal_cv_webhook_url: str = Field(default="", alias="MODAL_CV_WEBHOOK_URL")
    modal_cv_webhook_bearer: str = Field(default="", alias="MODAL_CV_WEBHOOK_BEARER")
    cv_teacher_name: str = Field(default="Teacher", alias="CV_TEACHER_NAME")
    worker_dry_run: bool = Field(default=False, alias="WORKER_DRY_RUN")
    port: int = Field(default=8080, alias="PORT")
    backend_status_webhook: str = Field(default="", alias="BACKEND_STATUS_WEBHOOK")
    backend_status_webhook_bearer: str = Field(default="", alias="BACKEND_STATUS_WEBHOOK_BEARER")


class OrchestratorWorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    google_cloud_project: str = Field(default="senior-design-488908")
    gcs_bucket_name: str = Field(default="lectureai_processed", alias="GCS_BUCKET_NAME")
    gcs_full_videos_bucket: str = Field(default="lectureai_full_videos", alias="GCS_FULL_VIDEOS_BUCKET")
    orchestrator_provider_order: str = Field(default="", alias="ORCHESTRATOR_PROVIDER_ORDER")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_extra: str = Field(default="", alias="GROQ_EKSTRA")
    gemini_provider: str = Field(default="vertex", alias="GEMINI_PROVIDER")
    vertex_location: str = Field(default="us-central1", alias="VERTEX_LOCATION")
    gemini_model: str = Field(default="gemini-1.5-flash", alias="GEMINI_MODEL")
    groq_model: str = Field(default="llama-3.3-70b-versatile", alias="GROQ_MODEL")
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_model: str = Field(
        default="google/gemini-2.0-flash-001", alias="OPENROUTER_MODEL"
    )
    quality_agent_model: str = Field(
        default="meta-llama/llama-3.3-70b-instruct",
        alias="QUALITY_AGENT_MODEL",
    )
    chunk_minutes: int = Field(default=60, alias="CHUNK_MINUTES")
    orchestrator_degraded_fallback: str = Field(default="", alias="ORCHESTRATOR_DEGRADED_FALLBACK")
    orchestrator_llm_spacing_sec: str = Field(default="", alias="ORCHESTRATOR_LLM_SPACING_SEC")
    worker_dry_run: bool = Field(default=False, alias="WORKER_DRY_RUN")
    backend_status_webhook: str = Field(default="", alias="BACKEND_STATUS_WEBHOOK")
    backend_status_webhook_bearer: str = Field(default="", alias="BACKEND_STATUS_WEBHOOK_BEARER")
