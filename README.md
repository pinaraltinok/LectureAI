# LectureAI Pipeline

## Architecture
The pipeline ingests lecture videos from GCS, triggers processing through Pub/Sub, and runs three Cloud Run workers: CV trigger, audio processing, and orchestrator/report generation. CV analysis is executed on Modal (GPU side), audio analysis is executed with AssemblyAI, and the orchestrator composes a final QA report with Gemini/Groq fallbacks, generates PDF output, and stores artifacts back into GCS.

## Project structure
```text
src/
  audio/          — AssemblyAI client and schemas
  orchestrator/   — Gemini report generation
  common/         — Shared utilities (NEW)
scripts/
  audio_worker.py        — Cloud Run: audio processing
  cv_worker.py           — Cloud Run: CV trigger
  orchestrator_worker.py — Cloud Run: report generation
  run_pipeline.py        — Local batch runner
  generate_pdf.py        — Standalone PDF generator
  trigger_analysis.py    — Manual pipeline trigger
modal/
  cv_app.py       — Modal GPU CV engine
video/
  cv_engine.py    — CV pipeline entry point
docker/           — Dockerfiles for each worker
```

## Environment variables
Cloud Run workers (`audio_worker`, `cv_worker`, `orchestrator_worker`) read the same keys through typed settings in `src/common/config.py` (pydantic-settings). Other modules still use `os.environ` until migrated.

From `.env.example` / `scripts/.env`:

- `GOOGLE_APPLICATION_CREDENTIALS`: local service account json path (local runs only)
- `GOOGLE_CLOUD_PROJECT`: GCP project id
- `GCS_FULL_VIDEOS_BUCKET`: source MP4 bucket
- `GCS_BUCKET_NAME` / `GCS_BUCKET_PROCESSED`: processed artifacts bucket
- `GCS_BUCKET_VIDEOS`: full video bucket alias used by deploy scripts
- `ASSEMBLYAI_API_KEY`: AssemblyAI credential for audio worker
- `GEMINI_PROVIDER`: `vertex` or `aistudio`
- `VERTEX_LOCATION`: Vertex region (for Gemini on Vertex)
- `GEMINI_API_KEY`: AI Studio key (required for `aistudio`)
- `GROQ_API_KEY`: Groq fallback key
- `GROQ_EKSTRA`: optional second Groq key for rate-limit fallback
- `GEMINI_MODEL`: optional Gemini model override
- `GROQ_MODEL`: optional Groq model override
- `ORCHESTRATOR_PROVIDER_ORDER`: provider sequence, e.g. `aistudio,vertex,groq`
- `ORCHESTRATOR_DEGRADED_FALLBACK`: `true/false`, emit fallback report if LLM fails
- `ORCHESTRATOR_LLM_SPACING_SEC`: optional delay between LLM calls
- `CHUNK_MINUTES`: chunk size for report analysis
- `MODAL_CV_WEBHOOK_URL`: Cloud Run CV worker target URL on Modal
- `MODAL_CV_WEBHOOK_BEARER`: auth token for Modal webhook
- `CV_TEACHER_NAME`: fallback teacher name used in CV trigger payload
- `BACKEND_STATUS_WEBHOOK`: full URL of the backend `POST` endpoint that accepts worker events (e.g. `https://<host>/api/pipeline/worker-events`)
- `BACKEND_STATUS_WEBHOOK_BEARER`: optional `Authorization: Bearer` token; must match whatever secret the backend checks (set on all three Cloud Run workers via deploy)
- On worker failures (`status`: `failed`), `detail` is JSON with schema `pipeline.failure.v1` (`retryable`, `error_code`, `message`, optional `internal_stage` for audio sub-stages).
- Structured stderr logs from logger `pipeline.observability`: one JSON object per line, schema `pipeline.log.v1` (`service`, `video_id`, `stage`, `event`, `status`, `attempt`, `duration_ms`, `error_code`, optional extras like `outcome`, `waiting_for`).

## Running locally
```bash
python -m scripts.run_pipeline --dry-run
python -m scripts.run_pipeline
```

## Deploying
```bash
python scripts/deploy_cloud_run.py
```
