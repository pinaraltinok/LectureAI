# LectureAI Video Segmenter — Production Guide

## Architecture Overview

```
┌───────────────────────┐  object.finalized  ┌──────────────────┐  upload  ┌───────────────────┐
│ lectureai_full_videos │ ── Eventarc ─────▸ │  Cloud Function  │ ───────▸ │  lectureai_       │
│  /Lesson_Records/*    │                    │  video-segmenter │          │  processed        │
└───────────────────────┘                    └──────────────────┘          └───────────────────┘
                                               │  FFmpeg -c copy
                                               │  /tmp workspace
```

---

## IAM Permissions Required

| Principal | Role | Purpose |
|---|---|---|
| GCS Service Account | `roles/pubsub.publisher` | Emit Eventarc notifications |
| Compute Service Account | `roles/eventarc.eventReceiver` | Receive trigger events |
| Compute Service Account | `roles/storage.objectAdmin` | Read inbox + write processed |
| Compute Service Account | `roles/run.invoker` | Eventarc → Cloud Run invocation |

---

## FFmpeg Command Explained

```bash
ffmpeg -y -ss <START> -i <INPUT> -t 600 -c copy -movflags +faststart -avoid_negative_ts make_zero <OUTPUT>
```

| Flag | Purpose |
|---|---|
| `-ss <START>` | Seek to start position (input-level = fast) |
| `-t 600` | Capture 600 seconds of content |
| `-c copy` | Stream-copy — **no re-encoding**, ~100× faster |
| `-movflags +faststart` | Move moov atom to front for streaming |
| `-avoid_negative_ts make_zero` | Fix timestamp discontinuities at boundaries |

---

## Scalability Considerations

| Concern | Mitigation |
|---|---|
| **Large files (≤ 2 GB)** | 32 GiB disk, 4 GiB RAM, 540 s timeout |
| **Concurrent uploads** | `max-instances=10`, `concurrency=1` (CPU-bound FFmpeg) |
| **Cold starts** | Storage client singleton reused across warm invocations |
| **Cost control** | Max-instances cap prevents runaway scaling |
| **Disk exhaustion** | Single-file download + immediate cleanup in `finally` block |
| **Region colocation** | Deploy function in same region as buckets to avoid egress |

> **Scaling beyond 10 instances**: Increase `--max-instances` in `deploy.sh`. Each instance can handle one video at a time since FFmpeg is CPU-bound.

---

## Error Handling Strategy

| Failure | Handling |
|---|---|
| **FFmpeg crash** | `subprocess.CalledProcessError` caught → stderr logged → `RuntimeError` raised |
| **GCS download failure** | Exception propagates → Cloud Functions auto-retries (Eventarc default) |
| **GCS upload failure** | Same retry behaviour; idempotency guard prevents duplicates on re-run |
| **Non-video file uploaded** | `ffprobe` fails → caught and logged with file name |
| **Disk full** | `finally` block runs `shutil.rmtree` to guarantee cleanup |
| **Timeout** | Function terminates; next retry re-downloads and re-segments (idempotent) |

### Retry Behaviour

2nd-gen Cloud Functions use Eventarc (backed by Pub/Sub). By default, failed invocations are retried. To avoid infinite retries on permanently bad files:

```bash
# Attach a dead-letter topic
gcloud pubsub subscriptions update <SUB_ID> \
    --dead-letter-topic=lectureai-dlq \
    --max-delivery-attempts=5
```

---

## Logging Structure

All log entries are structured JSON with these fields:

```json
{
  "severity": "INFO",
  "message": "[a1b2c3d4] Download complete: 1234.5 MiB",
  "logger": "video-segmenter"
}
```

| Field | Description |
|---|---|
| `severity` | `INFO`, `WARNING`, `ERROR` |
| Correlation ID | `[8-char UUID]` prefix in every message — ties all logs for one invocation |
| `logger` | Always `video-segmenter` for easy filtering |

### Useful Cloud Logging queries

```
resource.type="cloud_run_revision"
resource.labels.service_name="video-segmenter"
jsonPayload.message=~"RESULT metadata"
```

---

## Large Video Handling Best Practices

1. **Stream-copy only** — `-c copy` avoids re-encoding, reducing CPU and time by ~100×.
2. **Input-level seek** — `-ss` before `-i` uses byte-level seeking, not decode-level.
3. **Region colocation** — Buckets and function in the same region eliminate egress costs and reduce latency.
4. **Dedicated temp dirs** — `tempfile.mkdtemp()` prevents collisions between concurrent invocations.
5. **Guaranteed cleanup** — `finally` + `shutil.rmtree` prevents `/tmp` from filling across warm starts.
6. **Idempotency** — Checking for existing segments before processing prevents duplicate work on retries.

---

## Deployment Checklist

```
1. gcloud auth login
2. gcloud config set project <YOUR_PROJECT_ID>
3. cd cloud-functions/video-segmenter/
4. chmod +x deploy.sh
5. ./deploy.sh
6. gsutil cp sample_lecture.mp4 gs://lectureai_full_videos/Lesson_Records/
7. gcloud functions logs read video-segmenter --gen2 --region=europe-west4 --limit=50
8. gsutil ls gs://lectureai_processed/sample_lecture/
```
