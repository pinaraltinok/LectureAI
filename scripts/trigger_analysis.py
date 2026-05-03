"""Pipeline Trigger — tek butonla Audio + CV analizini başlat.

Ortak ``lecture-analysis-requested`` topic'ine bir mesaj publish eder.
Audio Worker (Cloud Run push) ve CV Worker (Colab pull) aynı mesajı alıp
paralel çalışmaya başlar.

Kullanım:
    python scripts/trigger_analysis.py TUR40W245_TUE-18_8-9
    python scripts/trigger_analysis.py TUR40W245_TUE-18_8-9 "Ahmet Hoca"
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from google.cloud import pubsub_v1

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.env_bootstrap import load_dotenv_files  # noqa: E402

load_dotenv_files(ROOT)

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "senior-design-488908")
TOPIC_ID = os.environ.get("TRIGGER_TOPIC", "lecture-analysis-requested")


def trigger(video_id: str, teacher_name: str = "Teacher") -> str:
    """Pub/Sub'a iş emri publish et. Dönen message ID'yi döndürür."""

    publisher = pubsub_v1.PublisherClient()
    topic_path = publisher.topic_path(PROJECT_ID, TOPIC_ID)

    payload = json.dumps(
        {
            "video_id": video_id,
            "teacher_name": teacher_name,
        }
    ).encode("utf-8")

    future = publisher.publish(topic_path, payload)
    msg_id = future.result(timeout=30)
    print(
        f"[OK] Published -> {TOPIC_ID}\n"
        f"   video_id     : {video_id}\n"
        f"   teacher_name : {teacher_name}\n"
        f"   message_id   : {msg_id}"
    )
    return msg_id


def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Kullanım:\n"
            "  python scripts/trigger_analysis.py <video_id> [teacher_name]\n\n"
            "Örnek:\n"
            '  python scripts/trigger_analysis.py TUR40W245_TUE-18_8-9 "Ahmet Hoca"',
            file=sys.stderr,
        )
        sys.exit(1)

    video_id = sys.argv[1]
    teacher_name = sys.argv[2] if len(sys.argv) > 2 else "Teacher"
    trigger(video_id, teacher_name)


if __name__ == "__main__":
    main()
