"""Colab Pull-Based CV Worker.

Google Colab'de sonsuz döngüde Pub/Sub'dan iş emri bekler.
Mesaj gelince ``video.cv_engine.run()`` fonksiyonunu GPU üzerinde çalıştırır,
sonucu GCS'e yazar ve ``lecture-cv-completed`` topic'ine publish eder.

Kullanım (Colab notebook hücresi):
    !python scripts/cv_colab_worker.py

Ortam değişkenleri (opsiyonel):
    GOOGLE_CLOUD_PROJECT  – GCP proje ID (default: senior-design-488908)
    CV_PULL_SUBSCRIPTION  – Pull subscription adı (default: cv-worker-pull-sub)
    CV_TEACHER_NAME       – Öğretmen adı fallback (default: Teacher)
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from concurrent.futures import TimeoutError as FuturesTimeoutError
from pathlib import Path

from google.cloud import pubsub_v1

# ---------------------------------------------------------------------------
# Repo root'u sys.path'e ekle
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from video.cv_engine import run as run_cv_analysis  # noqa: E402

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "senior-design-488908")
SUBSCRIPTION_ID = os.environ.get("CV_PULL_SUBSCRIPTION", "cv-worker-pull-sub")
CV_COMPLETED_TOPIC = "lecture-cv-completed"
DEFAULT_TEACHER_NAME = os.environ.get("CV_TEACHER_NAME", "Teacher")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("cv_colab_worker")

# ---------------------------------------------------------------------------
# Pub/Sub clients
# ---------------------------------------------------------------------------
subscriber = pubsub_v1.SubscriberClient()
publisher = pubsub_v1.PublisherClient()

subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION_ID)
completed_topic_path = publisher.topic_path(PROJECT_ID, CV_COMPLETED_TOPIC)


def _process_message(message: pubsub_v1.subscriber.message.Message) -> None:
    """Tek bir Pub/Sub mesajını işle: CV analizi yap, sonucu publish et."""

    raw_data: dict = {}
    try:
        raw_data = json.loads(message.data.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        logger.error("Mesaj decode edilemedi, atlanıyor: %s", exc)
        message.ack()
        return

    video_id: str | None = raw_data.get("video_id")
    teacher_name: str = raw_data.get("teacher_name", DEFAULT_TEACHER_NAME)

    if not video_id:
        logger.warning("Mesajda video_id yok, atlanıyor: %s", raw_data)
        message.ack()
        return

    logger.info("[RECV] Alindi: %s -- CV analiz basliyor (teacher=%s)...", video_id, teacher_name)
    start = time.time()

    try:
        # ── Mevcut CV engine'i çalıştır ──────────────────────────────
        output_uri = run_cv_analysis(video_id=video_id, teacher_name=teacher_name)
        elapsed = time.time() - start
        logger.info(
            "[DONE] Tamamlandi: %s (%.1f sn) -> %s",
            video_id,
            elapsed,
            output_uri,
        )

        # ── Orchestrator'a haber ver ─────────────────────────────────
        completed_payload = json.dumps(
            {
                "video_id": video_id,
                "status": "completed",
                "worker": "colab",
                "elapsed_sec": round(elapsed, 1),
            }
        ).encode("utf-8")
        future = publisher.publish(completed_topic_path, completed_payload)
        future.result(timeout=30)
        logger.info("[PUB] Publish edildi -> lecture-cv-completed: %s", video_id)

        message.ack()

    except Exception as exc:
        elapsed = time.time() - start
        logger.exception(
            "[FAIL] CV analiz basarisiz -- video_id=%s (%.1f sn): %s",
            video_id,
            elapsed,
            exc,
        )
        # Mesaj kuyruğa geri döner, yeniden denenebilir
        message.nack()


def main() -> None:
    """Pull subscriber'ı başlat ve sonsuz dinle."""

    logger.info("=" * 60)
    logger.info("CV Worker (Colab) baslatiliyor...")
    logger.info("   Proje      : %s", PROJECT_ID)
    logger.info("   Subscription: %s", subscription_path)
    logger.info("   Completed -> : %s", completed_topic_path)
    logger.info("=" * 60)

    # Tek GPU → aynı anda sadece 1 mesaj işle
    flow_control = pubsub_v1.types.FlowControl(
        max_messages=1,
        max_bytes=10 * 1024 * 1024,  # 10 MB
    )

    streaming_pull = subscriber.subscribe(
        subscription_path,
        callback=_process_message,
        flow_control=flow_control,
    )

    logger.info("[READY] Dinlemede -- mesaj bekleniyor...")

    try:
        streaming_pull.result()  # Sonsuz dinle
    except FuturesTimeoutError:
        logger.warning("Streaming pull timeout, yeniden bağlanılıyor...")
        streaming_pull.cancel()
        streaming_pull.result()
    except KeyboardInterrupt:
        logger.info("[STOP] Worker durduruldu (Ctrl+C).")
        streaming_pull.cancel()
    except Exception as exc:
        logger.exception("Beklenmeyen hata: %s", exc)
        streaming_pull.cancel()
        raise


if __name__ == "__main__":
    main()
