from __future__ import annotations

import base64
import json
import logging
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.env_bootstrap import load_dotenv_files

load_dotenv_files(ROOT)
# Cloud Run uses ADC via service account; ignore local key-file hints.
os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("cv_worker")

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "senior-design-488908")
REGION = os.environ.get("GCP_REGION", "europe-west4")
ZONE = os.environ.get("GCP_ZONE", f"{REGION}-a")
ARTIFACT_REGION = os.environ.get("ARTIFACT_REGION", "europe-west4")
TEMPLATE_NAME = "cv-worker-template"
IMAGE_BASE = f"{ARTIFACT_REGION}-docker.pkg.dev/{PROJECT_ID}/lectureai-repo"
CV_IMAGE = f"{IMAGE_BASE}/cv-worker:latest"
app = FastAPI(title="cv-worker")


def _sanitize_video_id(video_id: str) -> str:
    normalized = re.sub(r"[^a-z0-9-]+", "-", video_id.lower())
    normalized = normalized.strip("-")
    return normalized[:32] or "video"


def _startup_script(video_id: str) -> str:
    teacher_name = os.environ.get("CV_TEACHER_NAME", "Teacher")
    return f"""#!/bin/bash
set -euxo pipefail
apt-get update
apt-get install -y docker.io
systemctl enable docker
systemctl start docker
gcloud auth configure-docker {ARTIFACT_REGION}-docker.pkg.dev --quiet
docker pull {CV_IMAGE}
docker run --rm \\
  -e GOOGLE_CLOUD_PROJECT={PROJECT_ID} \\
  -e CV_TEACHER_NAME="{teacher_name}" \\
  {CV_IMAGE} python3.11 video/cv_engine.py --video-id "{video_id}" --teacher-name "{teacher_name}"
MESSAGE=$(printf '{{"video_id":"%s","status":"completed","vm_name":"%s"}}' "{video_id}" "$(hostname)")
gcloud pubsub topics publish lecture-cv-completed --message "$MESSAGE"
shutdown -h now
"""


def _wait_for_operation(operation: Any, timeout: int = 1800) -> None:
    result = operation.result(timeout=timeout)
    del result
    if operation.error_code:
        raise RuntimeError(f"operation failed: code={operation.error_code} message={operation.error_message}")


def _launch_cv_vm(video_id: str) -> str:
    from google.cloud import compute_v1

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    name = f"cv-{_sanitize_video_id(video_id)}-{timestamp}"[:63]
    instance_client = compute_v1.InstancesClient()
    source_template = f"projects/{PROJECT_ID}/regions/{REGION}/instanceTemplates/{TEMPLATE_NAME}"
    startup = _startup_script(video_id)
    req = compute_v1.InsertInstanceRequest(
        project=PROJECT_ID,
        zone=ZONE,
        source_instance_template=source_template,
        instance_resource=compute_v1.Instance(
            name=name,
            metadata=compute_v1.Metadata(items=[compute_v1.Items(key="startup-script", value=startup)]),
            labels={"pipeline": "lectureai", "videoid": _sanitize_video_id(video_id)},
        ),
    )
    op = instance_client.insert(request=req)
    _wait_for_operation(op, timeout=900)
    return name


def _decode_payload(encoded_data: str) -> dict:
    def _fallback_kv_payload(raw: str) -> dict:
        stripped = raw.strip()
        if not (stripped.startswith("{") and stripped.endswith("}")):
            raise ValueError("payload is not object-like")
        inner = stripped[1:-1].strip()
        if not inner:
            return {}
        out: dict[str, str] = {}
        for chunk in inner.split(","):
            if ":" not in chunk:
                raise ValueError("payload item missing ':' separator")
            key, value = chunk.split(":", 1)
            out[key.strip().strip("\"'")] = value.strip().strip("\"'")
        return out

    try:
        decoded = base64.b64decode(encoded_data).decode("utf-8")
        try:
            return json.loads(decoded)
        except json.JSONDecodeError:
            # Accept legacy payloads like: {video_id:TUR40...}
            return _fallback_kv_payload(decoded)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid pubsub message payload: {exc}") from exc


@app.post("/run")
async def run(request: Request) -> dict:
    body = await request.json()
    logger.info("RAW BODY: %s", body)

    try:
        message = body.get("message", {}) if isinstance(body, dict) else {}
        data_b64 = message.get("data", "")
        logger.info("DATA B64: %s", data_b64)
        payload = _decode_payload(data_b64)
        logger.info("DECODED DATA: %s", payload)
        video_id = payload.get("video_id")
        logger.info("VIDEO ID: %s", video_id)
        if not video_id:
            return JSONResponse({"error": "no video_id"}, status_code=400)
    except Exception as exc:
        logger.error("PARSE ERROR: %s", exc)
        return JSONResponse({"error": str(exc)}, status_code=400)

    if os.environ.get("WORKER_DRY_RUN", "").lower() == "true":
        logger.info("cv dry-run video_id=%s", video_id)
        return {"ok": True, "video_id": video_id, "dry_run": True}

    try:
        vm_name = _launch_cv_vm(video_id)
        logger.info("cv vm launched video_id=%s vm=%s", video_id, vm_name)
        return {"ok": True, "video_id": video_id, "vm_name": vm_name}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("cv worker failed for video_id=%s: %s", video_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
