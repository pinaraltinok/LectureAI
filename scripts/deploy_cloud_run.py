"""Deploy LectureAI workers to Cloud Run (reads scripts/.env; does not print secrets)."""

from __future__ import annotations

import os
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


def _write_env_file(lines: list[str]) -> str:
    fd, path = tempfile.mkstemp(suffix=".env", text=True)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return path


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
    cv_region = raw.get("GCP_REGION", "europe-west4")
    cv_zone = raw.get("GCP_ZONE", f"{cv_region}-a")
    artifact_region = raw.get("ARTIFACT_REGION", "europe-west4")

    required = ["ASSEMBLYAI_API_KEY", "GEMINI_API_KEY"]
    for k in required:
        if k not in raw:
            print(f"Missing {k} in scripts/.env", file=sys.stderr)
            sys.exit(1)

    audio_env = _write_env_file(
        [
            f"GOOGLE_CLOUD_PROJECT={PROJECT}",
            f"ASSEMBLYAI_API_KEY={raw['ASSEMBLYAI_API_KEY']}",
            f"GCS_FULL_VIDEOS_BUCKET={videos}",
            f"GCS_BUCKET_NAME={processed}",
        ]
    )
    orch_env = _write_env_file(
        [
            f"GOOGLE_CLOUD_PROJECT={PROJECT}",
            f"GEMINI_API_KEY={raw['GEMINI_API_KEY']}",
            f"GCS_BUCKET_NAME={processed}",
            f"GCS_FULL_VIDEOS_BUCKET={videos}",
        ]
    )
    cv_env = _write_env_file(
        [
            f"GOOGLE_CLOUD_PROJECT={PROJECT}",
            f"GCP_REGION={cv_region}",
            f"GCP_ZONE={cv_zone}",
            f"ARTIFACT_REGION={artifact_region}",
        ]
    )

    tmp_files = [audio_env, orch_env, cv_env]

    services: list[tuple[str, str, str, str]] = [
        ("audio-worker", f"{IMAGE_BASE}/audio-worker:latest", audio_env, "3600"),
        ("orchestrator-worker", f"{IMAGE_BASE}/orchestrator-worker:latest", orch_env, "3600"),
        ("cv-worker", f"{IMAGE_BASE}/cv-worker:latest", cv_env, "900"),
    ]

    try:
        for name, image, envfile, timeout in services:
            print(f"Deploying {name} ...", flush=True)
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
                    envfile,
                    "--quiet",
                ],
                check=True,
            )
            subprocess.run(
                [
                    gcloud,
                    "run",
                    "services",
                    "update",
                    name,
                    "--region",
                    REGION,
                    "--remove-env-vars",
                    "GOOGLE_APPLICATION_CREDENTIALS",
                    "--quiet",
                ],
                check=True,
            )
    finally:
        for p in tmp_files:
            try:
                os.unlink(p)
            except OSError:
                pass

    print("Fetching service URLs ...", flush=True)
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
        print(f"{name}: {url}", flush=True)


if __name__ == "__main__":
    main()
