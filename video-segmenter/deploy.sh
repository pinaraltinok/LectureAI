#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# LectureAI — Video Segmenter :: Deployment Script
# ──────────────────────────────────────────────────────────────────────
# Prerequisites:
#   1. gcloud CLI installed & authenticated   (gcloud auth login)
#   2. A GCP project selected                 (gcloud config set project PROJECT_ID)
#   3. Billing enabled on the project
#   4. FFmpeg is available in the Cloud Function runtime (included in
#      the google-22 / ubuntu-22 base image used by 2nd-gen functions)
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
PROJECT_ID="$(gcloud config get-value project)"
REGION="europe-west4"                           # Netherlands
FUNCTION_NAME="video-segmenter"
RUNTIME="python311"
ENTRY_POINT="segment_video"                     # must match @cloud_event in main.py

INBOX_BUCKET="lectureai_full_videos"
PROCESSED_BUCKET="lectureai_processed"
EXPECTED_PREFIX="Lesson_Records/"

MEMORY="4Gi"                                    # 4 GiB — needed for large-file I/O
DISK="32Gi"                                     # 32 GiB — temp storage for 2 GB videos
TIMEOUT="540s"                                  # 9 min (max for 2nd-gen)
MAX_INSTANCES="10"                              # safeguard against runaway scaling
CONCURRENCY="1"                                 # one video per instance (CPU-heavy)

# ── 1. Enable required APIs ─────────────────────────────────────────
echo "▸ Enabling APIs …"
gcloud services enable \
    cloudfunctions.googleapis.com \
    cloudbuild.googleapis.com \
    eventarc.googleapis.com \
    run.googleapis.com \
    storage.googleapis.com \
    artifactregistry.googleapis.com \
    --project="$PROJECT_ID"

# ── 2. Create GCS buckets (idempotent) ──────────────────────────────
echo "▸ Creating buckets …"
gsutil ls -b "gs://${INBOX_BUCKET}" 2>/dev/null \
    || gsutil mb -l "$REGION" "gs://${INBOX_BUCKET}"

gsutil ls -b "gs://${PROCESSED_BUCKET}" 2>/dev/null \
    || gsutil mb -l "$REGION" "gs://${PROCESSED_BUCKET}"

# ── 3. Grant Eventarc permissions to GCS service account ────────────
echo "▸ Configuring IAM …"

# The GCS service account needs pubsub.publisher to emit Eventarc events
GCS_SA="$(gsutil kms serviceaccount -p "$PROJECT_ID")"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${GCS_SA}" \
    --role="roles/pubsub.publisher" \
    --condition=None \
    --quiet

# The default compute service account (used by the function)
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Eventarc Event Receiver — required for 2nd-gen trigger
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/eventarc.eventReceiver" \
    --condition=None \
    --quiet

# Storage Object Admin — download from inbox + upload to processed
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/storage.objectAdmin" \
    --condition=None \
    --quiet

# Cloud Run Invoker — allows Eventarc to invoke the underlying Cloud Run service
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/run.invoker" \
    --condition=None \
    --quiet

# ── 4. Deploy the Cloud Function (2nd gen) ──────────────────────────
echo "▸ Deploying function …"
gcloud functions deploy "$FUNCTION_NAME" \
    --gen2 \
    --region="$REGION" \
    --runtime="$RUNTIME" \
    --entry-point="$ENTRY_POINT" \
    --source="." \
    --trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
    --trigger-event-filters="bucket=${INBOX_BUCKET}" \
    --memory="$MEMORY" \
    --disk-size="$DISK" \
    --timeout="$TIMEOUT" \
    --max-instances="$MAX_INSTANCES" \
    --concurrency="$CONCURRENCY" \
    --set-env-vars="PROCESSED_BUCKET=${PROCESSED_BUCKET},EXPECTED_PREFIX=${EXPECTED_PREFIX}" \
    --quiet

echo ""
echo "✅  Deployment complete!"
echo "    Function : $FUNCTION_NAME"
echo "    Region   : $REGION"
echo "    Trigger  : gs://${INBOX_BUCKET} → object.finalized"
echo "    Output   : gs://${PROCESSED_BUCKET}/"
echo ""
echo "Test with:"
echo "  gsutil cp sample_lecture.mp4 gs://${INBOX_BUCKET}/Lesson_Records/"
echo "  gcloud functions logs read ${FUNCTION_NAME} --gen2 --region=${REGION} --limit=50"
