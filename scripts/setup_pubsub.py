"""Pub/Sub topic ve subscription'ları oluştur (idempotent).

Bu scripti bir kere çalıştırman yeter. Zaten var olan kaynakları
tekrar oluşturmaya çalışmaz.

Push subscription'lar için endpoint URL'lerini ortam değişkenleri
veya komut satırı argümanları ile ayarlayabilirsin:

  AUDIO_WORKER_URL=https://audio-worker-xxx.run.app \
  ORCHESTRATOR_WORKER_URL=https://orchestrator-worker-xxx.run.app \
  python scripts/setup_pubsub.py

Veya URL'siz çalıştırırsan sadece subscription oluşur,
push endpoint'i sonra gcloud ile ayarlanabilir.

Kullanım:
    python scripts/setup_pubsub.py
    python scripts/setup_pubsub.py --auto   # Cloud Run URL'lerini otomatik çeker
"""

from __future__ import annotations

import os
import subprocess
import shutil
import sys
from pathlib import Path

from google.api_core.exceptions import AlreadyExists, NotFound
from google.cloud import pubsub_v1
from google.protobuf import duration_pb2

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.env_bootstrap import load_dotenv_files  # noqa: E402

load_dotenv_files(ROOT)

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "senior-design-488908")
REGION = os.environ.get("CLOUD_RUN_REGION", "europe-west4")

# ── Topics ────────────────────────────────────────────────────────────────
TOPICS = [
    "lecture-analysis-requested",   # Ortak trigger topic
    "lecture-audio-completed",      # Audio worker → Orchestrator
    "lecture-cv-completed",         # CV worker → Orchestrator
    "lecture-report-completed",     # Orchestrator → (isteğe bağlı UI notification)
]

# ── Subscriptions ─────────────────────────────────────────────────────────
# (sub_id, topic_id, ack_deadline_sec, is_push, cloud_run_service_name, endpoint_path)
#
# is_push=True  → Push subscription (Cloud Run HTTP endpoint'e mesaj gönderir)
# is_push=False → Pull subscription (Colab worker gibi client'lar çeker)
#
# cloud_run_service_name: push endpoint URL'sini otomatik çekmek için
# endpoint_path: Cloud Run servisinin dinlediği path (genelde /run)
SUBSCRIPTIONS: list[tuple[str, str, int, bool, str, str]] = [
    # CV Worker — Colab pull (2 saat ack deadline, videolar uzun)
    ("cv-worker-pull-sub", "lecture-analysis-requested", 7200, False, "", ""),

    # Audio Worker — Cloud Run push
    ("audio-worker-push-sub", "lecture-analysis-requested", 600, True, "audio-worker", "/run"),

    # Orchestrator — CV tamamlandı (push)
    ("orchestrator-cv-sub", "lecture-cv-completed", 600, True, "orchestrator-worker", "/run"),

    # Orchestrator — Audio tamamlandı (push)
    ("orchestrator-audio-sub", "lecture-audio-completed", 600, True, "orchestrator-worker", "/run"),
]


def _ensure_topic(publisher: pubsub_v1.PublisherClient, topic_id: str) -> None:
    topic_path = publisher.topic_path(PROJECT_ID, topic_id)
    try:
        publisher.create_topic(request={"name": topic_path})
        print(f"  [OK] Topic olusturuldu: {topic_id}")
    except AlreadyExists:
        print(f"  [SKIP] Topic zaten var: {topic_id}")


def _get_cloud_run_url(service_name: str) -> str | None:
    """gcloud ile Cloud Run servis URL'sini çeker."""
    gcloud = shutil.which("gcloud") or shutil.which("gcloud.cmd")
    if not gcloud or not service_name:
        return None
    try:
        r = subprocess.run(
            [
                gcloud, "run", "services", "describe", service_name,
                "--region", REGION,
                "--format", "value(status.url)",
            ],
            capture_output=True, text=True, check=True,
        )
        url = (r.stdout or "").strip()
        return url if url else None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _resolve_push_endpoint(
    service_name: str,
    endpoint_path: str,
    auto_discover: bool,
) -> str | None:
    """Push endpoint URL'sini çözer: env var → auto-discover → None."""
    # 1. Ortam değişkenlerinden
    env_map = {
        "audio-worker": "AUDIO_WORKER_URL",
        "orchestrator-worker": "ORCHESTRATOR_WORKER_URL",
        "cv-worker": "CV_WORKER_URL",
    }
    env_key = env_map.get(service_name)
    if env_key:
        base = os.environ.get(env_key, "").strip()
        if base:
            return base.rstrip("/") + endpoint_path

    # 2. Auto-discover via gcloud
    if auto_discover:
        base = _get_cloud_run_url(service_name)
        if base:
            return base.rstrip("/") + endpoint_path

    return None


def _ensure_subscription(
    subscriber: pubsub_v1.SubscriberClient,
    sub_id: str,
    topic_id: str,
    ack_deadline: int,
    is_push: bool,
    push_endpoint: str | None,
) -> None:
    sub_path = subscriber.subscription_path(PROJECT_ID, sub_id)
    topic_path = f"projects/{PROJECT_ID}/topics/{topic_id}"

    # 24 saat message retention
    retention = duration_pb2.Duration(seconds=86400)

    request: dict = {
        "name": sub_path,
        "topic": topic_path,
        "ack_deadline_seconds": ack_deadline,
        "message_retention_duration": retention,
    }

    if is_push and push_endpoint:
        request["push_config"] = pubsub_v1.types.PushConfig(
            push_endpoint=push_endpoint,
            # Cloud Run authenticated push — service account OIDC token
            oidc_token=pubsub_v1.types.PushConfig.OidcToken(
                service_account_email=f"lectureai@{PROJECT_ID}.iam.gserviceaccount.com",
                audience=push_endpoint.split("/run")[0],  # base URL
            ),
        )

    mode = "push" if is_push else "pull"

    try:
        subscriber.create_subscription(request=request)
        if is_push and push_endpoint:
            print(f"  [OK] Subscription olusturuldu: {sub_id} ({mode}, endpoint={push_endpoint})")
        elif is_push:
            print(f"  [OK] Subscription olusturuldu: {sub_id} ({mode}, endpoint HENUZ SET EDILMEDI)")
        else:
            print(f"  [OK] Subscription olusturuldu: {sub_id} ({mode}, ack={ack_deadline}s)")
    except AlreadyExists:
        print(f"  [SKIP] Subscription zaten var: {sub_id}")

        # Zaten varsa ama push endpoint güncellemek gerekiyorsa
        if is_push and push_endpoint:
            _update_push_config(subscriber, sub_id, push_endpoint)


def _update_push_config(
    subscriber: pubsub_v1.SubscriberClient,
    sub_id: str,
    push_endpoint: str,
) -> None:
    """Mevcut subscription'ın push config'ini günceller."""
    sub_path = subscriber.subscription_path(PROJECT_ID, sub_id)
    try:
        push_config = pubsub_v1.types.PushConfig(
            push_endpoint=push_endpoint,
            oidc_token=pubsub_v1.types.PushConfig.OidcToken(
                service_account_email=f"lectureai@{PROJECT_ID}.iam.gserviceaccount.com",
                audience=push_endpoint.split("/run")[0],
            ),
        )
        subscriber.modify_push_config(
            request={
                "subscription": sub_path,
                "push_config": push_config,
            }
        )
        print(f"  [UPDATE] Push endpoint guncellendi: {sub_id} → {push_endpoint}")
    except Exception as exc:
        print(f"  [WARN] Push config guncellenemedi {sub_id}: {exc}")


def main() -> None:
    auto_discover = "--auto" in sys.argv
    print(f"Proje: {PROJECT_ID}")
    print(f"Region: {REGION}")
    if auto_discover:
        print("Auto-discover: ON (Cloud Run URL'leri gcloud ile cekilecek)\n")
    else:
        print("Auto-discover: OFF (URL'ler env var'lardan okunacak)\n")

    publisher = pubsub_v1.PublisherClient()
    subscriber = pubsub_v1.SubscriberClient()

    print("-- Topics --")
    for topic_id in TOPICS:
        _ensure_topic(publisher, topic_id)

    print("\n-- Subscriptions --")
    for sub_id, topic_id, ack_deadline, is_push, service_name, path in SUBSCRIPTIONS:
        push_endpoint = None
        if is_push:
            push_endpoint = _resolve_push_endpoint(service_name, path, auto_discover)

        _ensure_subscription(subscriber, sub_id, topic_id, ack_deadline, is_push, push_endpoint)

    print("\n[DONE] Pub/Sub altyapisi hazir!")

    # Eksik push endpoint'leri uyar
    missing = []
    for sub_id, _, _, is_push, service_name, path in SUBSCRIPTIONS:
        if is_push:
            endpoint = _resolve_push_endpoint(service_name, path, auto_discover)
            if not endpoint:
                missing.append((sub_id, service_name))

    if missing:
        print("\n[UYARI] Asagidaki push subscription'larin endpoint'i henuz set edilmedi:")
        for sub_id, svc in missing:
            print(f"  - {sub_id} (servis: {svc})")
        print(
            "\nCozum: Deploy sonrasi asagidaki komutu calistir:\n"
            "  python scripts/setup_pubsub.py --auto\n"
            "\nVeya manuel:\n"
            "  gcloud pubsub subscriptions modify-push-config <SUB_ID> \\\n"
            "    --push-endpoint=<CLOUD_RUN_URL>/run"
        )


if __name__ == "__main__":
    main()
