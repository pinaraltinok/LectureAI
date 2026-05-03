"""Deploy LectureAI workers to Cloud Run (reads scripts/.env; does not print secrets).

Deploy sonrası push subscription endpoint'lerini otomatik ayarlar.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

def _gcloud_exe() -> str:
    exe = shutil.which("gcloud") or shutil.which("gcloud.cmd")
    if not exe:
        raise FileNotFoundError("gcloud not found on PATH")
    return exe

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "scripts" / ".env"

PROJECT = "senior-design-488908"
REGION = "europe-west4"
IMAGE_BASE = f"{REGION}-docker.pkg.dev/{PROJECT}/lectureai-repo"
RUNTIME_SA = f"lectureai@{PROJECT}.iam.gserviceaccount.com"


def _parse_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def _write_env_vars_yaml(env_dict: dict[str, str], path: Path) -> None:
    """YAML for ``gcloud run deploy --env-vars-file`` (comma-safe values)."""
    lines = [f"{k}: {json.dumps(str(v))}" for k, v in env_dict.items()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ── Push subscription config ─────────────────────────────────────────────
# (subscription_id, cloud_run_service_name, endpoint_path)
PUSH_SUBSCRIPTIONS = [
    ("audio-worker-push-sub", "audio-worker", "/run"),
    ("orchestrator-cv-sub", "orchestrator-worker", "/run"),
    ("orchestrator-audio-sub", "orchestrator-worker", "/run"),
]


def _configure_push_endpoints(gcloud: str, service_urls: dict[str, str]) -> None:
    """Deploy sonrası push subscription endpoint'lerini ayarla."""
    print("\nConfiguring push subscription endpoints ...", flush=True)

    for sub_id, service_name, path in PUSH_SUBSCRIPTIONS:
        base_url = service_urls.get(service_name)
        if not base_url:
            print(f"  [SKIP] {sub_id}: {service_name} URL'si bulunamadi", flush=True)
            continue

        push_endpoint = base_url.rstrip("/") + path

        try:
            subprocess.run(
                [
                    gcloud,
                    "pubsub", "subscriptions", "modify-push-config",
                    sub_id,
                    f"--push-endpoint={push_endpoint}",
                    f"--push-auth-service-account={RUNTIME_SA}",
                    "--quiet",
                ],
                check=True,
            )
            print(f"  [OK] {sub_id} -> {push_endpoint}", flush=True)
        except subprocess.CalledProcessError as exc:
            print(f"  [ERR] {sub_id}: push config ayarlanamadi: {exc}", flush=True)


def main() -> None:
    try:
        gcloud = _gcloud_exe()
    except FileNotFoundError as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)

    if not ENV_PATH.is_file():
        print(f"Missing {ENV_PATH}", file=sys.stderr)
        sys.exit(1)

    raw = _parse_env(ENV_PATH)
    videos = raw.get("GCS_BUCKET_VIDEOS", "lectureai_full_videos")
    processed = raw.get("GCS_BUCKET_PROCESSED", "lectureai_processed")
    if not (raw.get("MODAL_CV_WEBHOOK_URL") or "").strip():
        print(
            "Warning: MODAL_CV_WEBHOOK_URL is not set in scripts/.env — cv-worker will return 503 at runtime.",
            file=sys.stderr,
        )
    required = ["ASSEMBLYAI_API_KEY"]
    for k in required:
        if not raw.get(k):
            print(f"Missing {k} in scripts/.env", file=sys.stderr)
            sys.exit(1)

    # Build env var dicts for each service
    audio_env = {
        "GOOGLE_CLOUD_PROJECT": PROJECT,
        "ASSEMBLYAI_API_KEY": raw["ASSEMBLYAI_API_KEY"],
        "GCS_FULL_VIDEOS_BUCKET": videos,
        "GCS_BUCKET_NAME": processed,
    }

    orch_env = {
        "GOOGLE_CLOUD_PROJECT": PROJECT,
        "GCS_BUCKET_NAME": processed,
        "GCS_FULL_VIDEOS_BUCKET": videos,
        "GEMINI_PROVIDER": raw.get("GEMINI_PROVIDER", "vertex"),
        "VERTEX_LOCATION": raw.get("VERTEX_LOCATION", "us-central1"),
    }
    for key in (
        "GEMINI_API_KEY",
        "GROQ_API_KEY",
        "GROQ_EKSTRA",
        "OPENROUTER_API_KEY",
        "OPENROUTER_MODEL",
        "QUALITY_AGENT_MODEL",
        "GEMINI_MODEL",
        "GROQ_MODEL",
        "ORCHESTRATOR_PROVIDER_ORDER",
        "ORCHESTRATOR_DEGRADED_FALLBACK",
        "ORCHESTRATOR_LLM_SPACING_SEC",
        "CHUNK_MINUTES",
    ):
        if raw.get(key):
            orch_env[key] = raw[key]

    cv_env: dict[str, str] = {
        "GOOGLE_CLOUD_PROJECT": PROJECT,
    }
    for key in ("MODAL_CV_WEBHOOK_URL", "MODAL_CV_WEBHOOK_BEARER", "CV_TEACHER_NAME"):
        if raw.get(key):
            cv_env[key] = raw[key]

    backend_status_webhook = (raw.get("BACKEND_STATUS_WEBHOOK") or "").strip()
    backend_status_bearer = (raw.get("BACKEND_STATUS_WEBHOOK_BEARER") or "").strip()
    if backend_status_webhook:
        audio_env["BACKEND_STATUS_WEBHOOK"] = backend_status_webhook
        orch_env["BACKEND_STATUS_WEBHOOK"] = backend_status_webhook
        cv_env["BACKEND_STATUS_WEBHOOK"] = backend_status_webhook
    if backend_status_bearer:
        audio_env["BACKEND_STATUS_WEBHOOK_BEARER"] = backend_status_bearer
        orch_env["BACKEND_STATUS_WEBHOOK_BEARER"] = backend_status_bearer
        cv_env["BACKEND_STATUS_WEBHOOK_BEARER"] = backend_status_bearer

    services: list[tuple[str, str, dict[str, str], str]] = [
        ("audio-worker", f"{IMAGE_BASE}/audio-worker:latest", audio_env, "3600"),
        ("orchestrator-worker", f"{IMAGE_BASE}/orchestrator-worker:latest", orch_env, "3600"),
        ("cv-worker", f"{IMAGE_BASE}/cv-worker:latest", cv_env, "900"),
    ]

    for name, image, env_dict, timeout in services:
        print(f"Deploying {name} ...", flush=True)
        with tempfile.TemporaryDirectory() as td:
            env_path = Path(td) / "env.yaml"
            _write_env_vars_yaml(env_dict, env_path)
            subprocess.run(
                [
                    gcloud,
                    "run",
                    "deploy",
                    name,
                    "--image",
                    image,
                    "--region",
                    REGION,
                    "--platform",
                    "managed",
                    "--service-account",
                    RUNTIME_SA,
                    "--no-allow-unauthenticated",
                    "--timeout",
                    timeout,
                    "--memory",
                    "2Gi",
                    "--cpu",
                    "2",
                    "--max-instances",
                    "5",
                    "--env-vars-file",
                    str(env_path),
                    "--quiet",
                ],
                check=True,
            )

    # Fetch service URLs
    print("\nFetching service URLs ...", flush=True)
    service_urls: dict[str, str] = {}
    for name, _, _, _ in services:
        r = subprocess.run(
            [
                gcloud,
                "run",
                "services",
                "describe",
                name,
                "--region",
                REGION,
                "--format",
                "value(status.url)",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        url = (r.stdout or "").strip()
        service_urls[name] = url
        print(f"  {name}: {url}", flush=True)

    # Configure push subscription endpoints
    _configure_push_endpoints(gcloud, service_urls)

    print("\n[DONE] Deploy ve push config tamamlandi!", flush=True)


if __name__ == "__main__":
    main()
