from __future__ import annotations

import base64
import json
import os
from typing import Any
from urllib import error as urlerror
from urllib import request as urlrequest

from google.cloud import pubsub_v1
from google.cloud import storage


def decode_pubsub_payload(body: dict[str, Any]) -> str:
    """Extract video_id from Pub/Sub push message body."""

    def _legacy_kv_object(raw: str) -> dict[str, str]:
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

    def _decode_data_field(encoded_data: str) -> dict[str, Any]:
        decoded = base64.b64decode(encoded_data).decode("utf-8").strip()
        if not decoded:
            raise ValueError("empty payload")
        try:
            first = json.loads(decoded)
        except json.JSONDecodeError:
            return _legacy_kv_object(decoded)
        if isinstance(first, dict):
            return first
        if isinstance(first, str):
            second = first.strip()
            if second.startswith("{"):
                parsed_second = json.loads(second)
                if isinstance(parsed_second, dict):
                    return parsed_second
            if second:
                return {"video_id": second}
        raise ValueError(f"unsupported payload type: {type(first).__name__}")

    if not isinstance(body, dict):
        raise ValueError("request body must be a JSON object")

    message = body.get("message")
    if isinstance(message, dict) and message.get("data"):
        payload = _decode_data_field(str(message["data"]))
    elif body.get("data"):
        payload = _decode_data_field(str(body["data"]))
    elif body.get("video_id"):
        payload = {"video_id": str(body["video_id"])}
    else:
        raise ValueError("missing message.data (wrapped/unwrapped) or video_id")

    video_id = str(payload.get("video_id") or "").strip()
    if not video_id:
        raise ValueError("video_id missing in payload")
    return video_id


def notify_backend(
    stage: str,
    status: str,
    video_id: str,
    detail: str = "",
) -> None:
    """Send status event to backend webhook if configured.

    Contract (POST ``BACKEND_STATUS_WEBHOOK``, JSON body):
    ``video_id``, ``stage``, ``status``, ``detail`` (all strings).
    Optional header: ``Authorization: Bearer <BACKEND_STATUS_WEBHOOK_BEARER>``.
    """
    webhook = (os.environ.get("BACKEND_STATUS_WEBHOOK") or "").strip()
    if not webhook:
        return
    bearer = (os.environ.get("BACKEND_STATUS_WEBHOOK_BEARER") or "").strip()
    payload = {
        "video_id": video_id,
        "stage": stage,
        "status": status,
        "detail": detail,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    req = urlrequest.Request(
        webhook,
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as response:
            response.read()
    except (urlerror.URLError, TimeoutError, ValueError):
        # Webhook failure should not break worker execution.
        return


def get_storage_client() -> storage.Client:
    """Return GCS storage client using ADC."""
    return storage.Client()


def get_pubsub_publisher() -> pubsub_v1.PublisherClient:
    """Return Pub/Sub publisher client."""
    return pubsub_v1.PublisherClient()
