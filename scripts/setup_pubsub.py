"""Pub/Sub topic ve subscription'ları oluştur (idempotent).

Bu scripti bir kere çalıştırman yeter. Zaten var olan kaynakları
tekrar oluşturmaya çalışmaz.

Kullanım:
    python scripts/setup_pubsub.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from google.api_core.exceptions import AlreadyExists
from google.cloud import pubsub_v1
from google.protobuf import duration_pb2

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.env_bootstrap import load_dotenv_files  # noqa: E402

load_dotenv_files(ROOT)

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "senior-design-488908")

# ── Topics ────────────────────────────────────────────────────────────────
TOPICS = [
    "lecture-analysis-requested",   # Ortak trigger topic
    "lecture-audio-completed",      # Audio worker → Orchestrator
    "lecture-cv-completed",         # CV worker → Orchestrator
    "lecture-report-completed",     # Orchestrator → (isteğe bağlı UI notification)
]

# ── Subscriptions ─────────────────────────────────────────────────────────
# (sub_id, topic_id, ack_deadline_sec, is_pull)
SUBSCRIPTIONS: list[tuple[str, str, int, bool]] = [
    # CV Worker — Colab pull (2 saat ack deadline, videolar uzun)
    ("cv-worker-pull-sub", "lecture-analysis-requested", 7200, True),
    # Orchestrator CV tarafı — push (Cloud Run endpoint lazım, ama sub oluşur)
    ("orchestrator-cv-sub", "lecture-cv-completed", 600, True),
    # Orchestrator Audio tarafı — push
    ("orchestrator-audio-sub", "lecture-audio-completed", 600, True),
]


def _ensure_topic(publisher: pubsub_v1.PublisherClient, topic_id: str) -> None:
    topic_path = publisher.topic_path(PROJECT_ID, topic_id)
    try:
        publisher.create_topic(request={"name": topic_path})
        print(f"  [OK] Topic olusturuldu: {topic_id}")
    except AlreadyExists:
        print(f"  [SKIP] Topic zaten var: {topic_id}")


def _ensure_subscription(
    subscriber: pubsub_v1.SubscriberClient,
    sub_id: str,
    topic_id: str,
    ack_deadline: int,
    is_pull: bool,
) -> None:
    sub_path = subscriber.subscription_path(PROJECT_ID, sub_id)
    topic_path = f"projects/{PROJECT_ID}/topics/{topic_id}"

    # 24 saat message retention
    retention = duration_pb2.Duration(seconds=86400)

    request = {
        "name": sub_path,
        "topic": topic_path,
        "ack_deadline_seconds": ack_deadline,
        "message_retention_duration": retention,
    }

    if not is_pull:
        # Push subscriptions need an endpoint — skip for now (set via Console/gcloud)
        pass

    try:
        subscriber.create_subscription(request=request)
        mode = "pull" if is_pull else "push"
        print(f"  [OK] Subscription olusturuldu: {sub_id} ({mode}, ack={ack_deadline}s)")
    except AlreadyExists:
        print(f"  [SKIP] Subscription zaten var: {sub_id}")


def main() -> None:
    print(f"Proje: {PROJECT_ID}\n")

    publisher = pubsub_v1.PublisherClient()
    subscriber = pubsub_v1.SubscriberClient()

    print("-- Topics --")
    for topic_id in TOPICS:
        _ensure_topic(publisher, topic_id)

    print("\n-- Subscriptions --")
    for sub_id, topic_id, ack_deadline, is_pull in SUBSCRIPTIONS:
        _ensure_subscription(subscriber, sub_id, topic_id, ack_deadline, is_pull)

    print("\n[DONE] Pub/Sub altyapisi hazir!")
    print(
        "\nNot: Audio Worker push subscription'i Cloud Run endpoint URL'i ile"
        "\n   GCP Console veya gcloud uzerinden ayarlamayi unutma:"
        "\n   gcloud pubsub subscriptions modify-push-config audio-worker-sub \\"
        f"\n     --push-endpoint=<AUDIO_WORKER_CLOUD_RUN_URL>/run"
    )


if __name__ == "__main__":
    main()
