"""Modal: GPU CV job + thin HTTP trigger (deploy: ``modal deploy modal/cv_app.py``).

Secrets (Modal dashboard), suggested name ``lectureai-gcp``:

- ``GCP_SA_JSON`` or ``SERVICE_ACCOUNT_JSON`` — service account JSON (GCS + Pub/Sub)
- ``GOOGLE_CLOUD_PROJECT`` — optional if JSON contains ``project_id``
- ``AUTH_TOKEN`` — optional; if set, ``Authorization: Bearer <token>`` required on POST

Optional GCS overrides (same names as Cloud Run / ``.env.example``):

- ``GCS_FULL_VIDEOS_BUCKET``, ``CV_GCS_VIDEO_PREFIX``, ``GCS_BUCKET_PROCESSED``, ``CV_GCS_RESULTS_PREFIX``

The HTTP handler returns immediately after ``run_cv_job.spawn.aio``; the GPU function
runs ``video.cv_engine.run`` and publishes to ``lecture-cv-completed``.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import modal
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

REPO_ROOT = Path(__file__).resolve().parents[1]
REQ = REPO_ROOT / "requirements.cv.txt"

# Fixed path so image-build downloads are visible at GPU runtime (not only under
# a build-only HOME). EasyOCR resolves models via EASYOCR_MODULE_PATH.
_EASYOCR_ROOT = "/opt/easyocr"

cv_image = (
    modal.Image.debian_slim(python_version="3.11")
    .env({"PYTHONPATH": "/app", "EASYOCR_MODULE_PATH": _EASYOCR_ROOT})
    .apt_install(
        "ffmpeg",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender1",
        "libgl1",
    )
    .pip_install_from_requirements(str(REQ))
    .run_commands(
        # Pre-download EasyOCR models at image build time to avoid
        # runtime network failures in GPU jobs.
        "python -c \"import easyocr; "
        "easyocr.Reader(['tr','en'], gpu=False, download_enabled=True); "
        "print('EasyOCR models downloaded OK')\""
    )
    # add_local_* last; include src for ``from src.cv_video_id`` used by cv_engine.
    .add_local_dir(str(REPO_ROOT / "video"), remote_path="/app/video")
    .add_local_dir(str(REPO_ROOT / "src"), remote_path="/app/src")
)

web_image = (
    modal.Image.debian_slim(python_version="3.11")
    .env({"PYTHONPATH": "/app"})
    .pip_install("fastapi[standard]")
    .add_local_dir(str(REPO_ROOT / "src"), remote_path="/app/src")
)

app = modal.App("lectureai-cv")
gcp_secret = modal.Secret.from_name("lectureai-gcp")
auth_scheme = HTTPBearer(auto_error=False)


def _load_gcp_credentials():
    from google.oauth2 import service_account

    raw = (os.environ.get("SERVICE_ACCOUNT_JSON") or os.environ.get("GCP_SA_JSON") or "").strip()
    if not raw:
        raise RuntimeError("SERVICE_ACCOUNT_JSON (or legacy GCP_SA_JSON) must be set in secret lectureai-gcp")
    info = json.loads(raw)
    return service_account.Credentials.from_service_account_info(info), info


@app.function(image=cv_image, gpu="T4", timeout=3600, secrets=[gcp_secret])
def run_cv_job(video_id: str, teacher_name: str) -> dict:
    if "/app" not in sys.path:
        sys.path.insert(0, "/app")
    from google.cloud import pubsub_v1

    from video.cv_engine import run as cv_run

    job_start = time.time()
    print(f"[run_cv_job] START video_id={video_id} teacher_name={teacher_name!r}", flush=True)
    credentials, info = _load_gcp_credentials()
    print("[run_cv_job] CREDENTIALS_LOADED", flush=True)
    output_uri = cv_run(video_id=video_id, teacher_name=teacher_name, credentials=credentials)
    print(f"[run_cv_job] CV_DONE output_uri={output_uri}", flush=True)
    project = (os.environ.get("GOOGLE_CLOUD_PROJECT") or info.get("project_id") or "").strip()
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT or project_id in SERVICE_ACCOUNT_JSON is required")
    publisher = pubsub_v1.PublisherClient(credentials=credentials)
    topic_path = publisher.topic_path(project, "lecture-cv-completed")
    body = json.dumps(
        {"video_id": video_id, "status": "completed", "worker": "modal"},
        ensure_ascii=False,
    ).encode("utf-8")
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            print(
                f"[run_cv_job] PUBSUB_PUBLISH_START attempt={attempt} topic={topic_path}",
                flush=True,
            )
            publisher.publish(topic_path, body).result(timeout=30)
            print("[run_cv_job] PUBSUB_PUBLISH_DONE", flush=True)
            elapsed = time.time() - job_start
            print(f"[run_cv_job] DONE elapsed_sec={elapsed:.1f}", flush=True)
            return {"video_id": video_id, "output_uri": output_uri}
        except Exception as exc:  # pragma: no cover
            last_error = exc
            print(
                f"[run_cv_job] PUBSUB_PUBLISH_FAILED attempt={attempt} error={exc!r}",
                flush=True,
            )
            if attempt < 3:
                time.sleep(2 * attempt)
    assert last_error is not None
    raise RuntimeError(f"Failed to publish lecture-cv-completed after retries: {last_error!r}")


@app.function(image=web_image, secrets=[gcp_secret])
@modal.fastapi_endpoint(method="POST")
async def run_trigger(
    request: Request,
    token: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
) -> dict:
    expected = (os.environ.get("AUTH_TOKEN") or "").strip()
    enforce_auth = (os.environ.get("MODAL_ENFORCE_AUTH") or "").strip().lower() == "true"
    if enforce_auth and expected:
        if token is None or token.credentials != expected:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect bearer token",
                headers={"WWW-Authenticate": "Bearer"},
            )
    ct = (request.headers.get("content-type") or "").lower()
    if "application/json" not in ct:
        raise HTTPException(
            status_code=415,
            detail="Content-Type must be application/json",
        )
    try:
        item = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"invalid JSON body: {exc}") from exc
    if not isinstance(item, dict):
        raise HTTPException(status_code=400, detail="JSON body must be a JSON object")
    if "/app" not in sys.path:
        sys.path.insert(0, "/app")
    from src.cv_video_id import normalize_cv_video_id

    raw_id = item.get("video_id")
    if not raw_id:
        raise HTTPException(status_code=400, detail="video_id required")
    video_id = normalize_cv_video_id(str(raw_id))
    if not video_id:
        raise HTTPException(status_code=400, detail="video_id empty after normalization")
    teacher_name = item.get("teacher_name") or os.environ.get("CV_TEACHER_NAME", "Teacher")
    print(
        f"[run_trigger] ACCEPTED raw_video_id={raw_id!r} normalized_video_id={video_id} teacher_name={teacher_name!r}",
        flush=True,
    )
    await run_cv_job.spawn.aio(video_id, teacher_name)
    return {"accepted": True, "video_id": video_id}
