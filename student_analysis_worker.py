"""
Student Voice Analysis — Cloud Run Worker (HTTP trigger).

This is the bridge between the web-app PubSub trigger and the existing
standalone pipeline (unified_pipeline.py). It:

1. Receives a PubSub push message via HTTP POST
2. Sends webhook progress events back to the web-app backend
3. Runs the 3-stage pipeline (transcript → biometric match → report)
4. Uploads the final JSON report to GCS for the web-app to poll

Deployment:  Cloud Run service with PubSub push subscription.
Local test:  python student_analysis_worker.py --local --student "Yaman" --video "..." --reference "yaman.mp3"
"""

import os
import sys
import json
import time
import base64
import traceback
import subprocess
from pathlib import Path
from flask import Flask, request, jsonify

# ── Configuration ─────────────────────────────────────────────
WEBAPP_BACKEND_URL = os.getenv("WEBAPP_BACKEND_URL", "http://localhost:3001")
PIPELINE_WEBHOOK_SECRET = os.getenv("PIPELINE_WEBHOOK_SECRET", "")
PROCESSED_BUCKET = os.getenv("PROCESSED_BUCKET", "lectureai_processed")
STUDENT_REPORTS_PREFIX = os.getenv("STUDENT_REPORTS_PREFIX", "student_reports")

OUT_DIR = Path("core/registry_output")
REGISTRY_PATH = OUT_DIR / "student_registry.json"

app = Flask(__name__)


def get_safe_name(name):
    """Normalize Turkish characters for file paths."""
    return (name.lower()
            .replace(" ", "_")
            .replace("ö", "o").replace("ü", "u").replace("ç", "c")
            .replace("ş", "s").replace("ı", "i").replace("ğ", "g")
            .replace("İ", "i").replace("i̇", "i"))


def emit_progress(video_id, stage, detail=""):
    """Send a webhook event to the web-app backend for progress tracking."""
    import httpx
    url = f"{WEBAPP_BACKEND_URL}/api/pipeline/worker-events"
    payload = {
        "video_id": video_id,
        "stage": stage,
        "detail": detail,
    }
    headers = {"Content-Type": "application/json"}
    if PIPELINE_WEBHOOK_SECRET:
        headers["x-pipeline-secret"] = PIPELINE_WEBHOOK_SECRET
    try:
        resp = httpx.post(url, json=payload, headers=headers, timeout=10)
        print(f"[WEBHOOK] {stage} → {resp.status_code}")
    except Exception as e:
        print(f"[WEBHOOK] Failed to send {stage}: {e}")


def run_student_pipeline(video_id, student_name, video_blob, reference_audio_blob):
    """
    Run the full 3-stage student voice analysis pipeline.
    Returns the path to the generated report JSON, or None on failure.
    """
    from stream_audio import ensure_video_in_gcs, load_env_file
    
    print(f"\n{'='*60}")
    print(f"STUDENT ANALYSIS WORKER: {student_name} | {video_blob}")
    print(f"{'='*60}\n")

    load_env_file()
    if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    # ── Stage 0: GCS Verification ───────────────────────────
    emit_progress(video_id, "student:transcript_started", "Video GCS'den doğrulanıyor...")
    try:
        video_blob = ensure_video_in_gcs(video_blob)
    except Exception as e:
        emit_progress(video_id, "student:failed", f"Video hazırlama hatası: {e}")
        return None

    # ── Stage 1: Transcript (AssemblyAI) ────────────────────
    video_stem = Path(video_blob).stem
    transcript_filename = f"{get_safe_name(video_stem)}_full_transcript.json"
    transcript_path = OUT_DIR / transcript_filename

    if transcript_path.exists():
        print(f"[OK] Transkript zaten mevcut: {transcript_path}")
    else:
        emit_progress(video_id, "student:transcript_started", "AssemblyAI transkripti oluşturuluyor...")
        try:
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            cmd = [
                sys.executable, "speaker_identity_pipeline.py",
                "--video", video_blob,
                "--student", student_name,
                "--reference-blob", reference_audio_blob,
                "--direct-video",
                "--only-transcript"
            ]
            subprocess.run(cmd, check=True, env=env)
            if not transcript_path.exists():
                emit_progress(video_id, "student:failed", "Transkript oluşturulamadı.")
                return None
        except Exception as e:
            emit_progress(video_id, "student:failed", f"Transkript hatası: {e}")
            return None

    emit_progress(video_id, "student:transcript_completed", "Transkript tamamlandı.")

    # ── Stage 2: Biometric Speaker Matching ─────────────────
    emit_progress(video_id, "student:biometric_started", "Ses eşleştirme başlıyor...")
    speaker_id = None

    # Check registry first
    if REGISTRY_PATH.exists():
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            registry = json.load(f)
            for entry in registry:
                if entry["id"].lower() == student_name.lower():
                    speaker_id = entry.get("speaker_id")
                    break

    if speaker_id:
        print(f"[OK] Konuşmacı ID zaten kayıtlı: Speaker {speaker_id}")
        emit_progress(video_id, "student:biometric_completed", f"Mevcut eşleşme: Speaker {speaker_id}")
    else:
        emit_progress(video_id, "student:biometric_matching", "CPU tabanlı ses eşleştirme yapılıyor...")
        try:
            # Use the CPU-based MFCC matcher (no GPU / Modal required)
            from voice_biometric_matcher import VoiceBiometricMatcher
            import tempfile
            from google.cloud import storage as gcs_storage

            storage_client = gcs_storage.Client()

            # Download reference audio to temp
            ref_bucket = os.getenv("STUDENT_AUDIO_BUCKET", "lectureai_student_audios")
            ref_blob = storage_client.bucket(ref_bucket).blob(reference_audio_blob)
            ref_tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
            ref_blob.download_to_filename(ref_tmp.name)
            ref_tmp.close()

            # Download video audio
            video_bucket = os.getenv("VIDEO_BUCKET", "lectureai_full_videos")
            vid_blob = storage_client.bucket(video_bucket).blob(video_blob)
            vid_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            vid_blob.download_to_filename(vid_tmp.name)
            vid_tmp.close()

            matcher = VoiceBiometricMatcher()
            match_result = matcher.match_student_by_voice(
                ref_tmp.name, vid_tmp.name, str(transcript_path)
            )

            # Cleanup
            os.unlink(ref_tmp.name)
            os.unlink(vid_tmp.name)

            if match_result:
                import re
                raw_speaker = match_result["best_speaker"]
                num_match = re.search(r'\d+', str(raw_speaker))
                if num_match:
                    idx = int(num_match.group())
                    speaker_id = chr(64 + idx) if idx > 0 else "A"
                else:
                    speaker_id = raw_speaker

                # Update registry
                registry = []
                if REGISTRY_PATH.exists():
                    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                        registry = json.load(f)

                found = False
                for entry in registry:
                    if entry["id"].lower() == student_name.lower():
                        entry["speaker_id"] = speaker_id
                        entry["voice_notes"] = f"Speaker {speaker_id} (Score: {match_result.get('score', 0):.2f})"
                        found = True
                        break
                if not found:
                    registry.append({
                        "id": student_name,
                        "speaker_id": speaker_id,
                        "is_student": True,
                        "voice_notes": f"Speaker {speaker_id} (Score: {match_result.get('score', 0):.2f})",
                        "voice_confirmed": True,
                        "detection_method": "cpu_mfcc_biometric",
                    })

                REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
                with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
                    json.dump(registry, f, ensure_ascii=False, indent=2)

                emit_progress(video_id, "student:biometric_completed",
                              f"Eşleşme: Speaker {speaker_id} (Skor: {match_result.get('score', 0):.2f})")
            else:
                emit_progress(video_id, "student:failed", "Ses eşleştirme başarısız.")
                return None
        except Exception as e:
            emit_progress(video_id, "student:failed", f"Biyometrik hata: {e}")
            traceback.print_exc()
            return None

    # ── Stage 3: Pedagogical Report (Gemini) ────────────────
    if not speaker_id:
        emit_progress(video_id, "student:failed", "Speaker ID belirlenemedi.")
        return None

    emit_progress(video_id, "student:report_generating", "Pedagojik rapor oluşturuluyor...")
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        cmd = [sys.executable, "core/generate_student_report.py", student_name, str(transcript_path)]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)

        if result.returncode != 0:
            emit_progress(video_id, "student:failed", f"Rapor hatası: {result.stderr[:200]}")
            return None

        print(f"[OK] Rapor oluşturuldu.")
    except Exception as e:
        emit_progress(video_id, "student:failed", f"Rapor oluşturma başarısız: {e}")
        return None

    # ── Stage 4: Upload JSON summary to GCS ─────────────────
    emit_progress(video_id, "student:report_uploading", "Rapor GCS'ye yükleniyor...")
    try:
        from google.cloud import storage as gcs_storage
        storage_client = gcs_storage.Client()
        bucket = storage_client.bucket(PROCESSED_BUCKET)
        safe_name = get_safe_name(student_name)

        # Build a structured JSON report for the web-app
        report_json = {
            "_analysisType": "student_voice",
            "_studentName": student_name,
            "_videoId": video_id,
            "_speakerId": speaker_id,
            "_completedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "student_name": student_name,
            "video_id": video_id,
            "speaker_id": speaker_id,
            "biometric_score": match_result.get("score", 0) if match_result else 0,
            "all_speaker_scores": match_result.get("all_scores", {}) if match_result else {},
        }

        # Read the generated markdown if it exists
        md_path = f"data/FINAL_RAPOR_{student_name.replace(' ', '_')}.md"
        if os.path.exists(md_path):
            with open(md_path, "r", encoding="utf-8") as f:
                report_json["report_markdown"] = f.read()

        # Upload JSON
        json_blob_path = f"{STUDENT_REPORTS_PREFIX}/{safe_name}/{video_id}.json"
        blob = bucket.blob(json_blob_path)
        blob.upload_from_string(
            json.dumps(report_json, ensure_ascii=False, indent=2),
            content_type="application/json",
        )
        print(f"[OK] JSON rapor yüklendi: gs://{PROCESSED_BUCKET}/{json_blob_path}")

        emit_progress(video_id, "student:completed", "Öğrenci ses analizi tamamlandı!")
        return json_blob_path

    except Exception as e:
        emit_progress(video_id, "student:failed", f"GCS yükleme hatası: {e}")
        traceback.print_exc()
        return None


# ── HTTP Endpoint (Cloud Run / PubSub push) ─────────────────

@app.route("/", methods=["POST"])
def handle_pubsub():
    """Handle PubSub push subscription messages."""
    envelope = request.get_json(silent=True)
    if not envelope:
        return jsonify({"error": "Bad Request: no JSON body"}), 400

    # PubSub wraps messages in an "envelope"
    pubsub_message = envelope.get("message", {})
    if not pubsub_message:
        return jsonify({"error": "Bad Request: no PubSub message"}), 400

    try:
        data = json.loads(base64.b64decode(pubsub_message.get("data", "")).decode("utf-8"))
    except Exception:
        return jsonify({"error": "Bad Request: invalid message data"}), 400

    video_id = data.get("video_id", "")
    student_name = data.get("student_name", "")
    reference_audio_blob = data.get("reference_audio_blob", "")
    video_uri = data.get("video_uri", "")

    if not all([video_id, student_name, reference_audio_blob, video_uri]):
        return jsonify({"error": "Missing required fields"}), 400

    # Extract the blob path from gs:// URI if needed
    video_blob = video_uri
    if video_uri.startswith("gs://"):
        parts = video_uri.replace("gs://", "").split("/", 1)
        video_blob = parts[1] if len(parts) > 1 else video_uri

    print(f"[WORKER] Processing student={student_name}, video_id={video_id}")
    result = run_student_pipeline(video_id, student_name, video_blob, reference_audio_blob)

    if result:
        return jsonify({"status": "completed", "report_path": result}), 200
    else:
        return jsonify({"status": "failed"}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "student-analysis-worker"}), 200


# ── Local CLI mode ──────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Student Voice Analysis Worker")
    parser.add_argument("--local", action="store_true", help="Run pipeline locally (no HTTP server)")
    parser.add_argument("--student", default="Yaman")
    parser.add_argument("--video", default="Lesson_Records/1777550695949___4.L2_Araba_Olu__turmak.mp4")
    parser.add_argument("--reference", default="yaman.mp3")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8080")))
    args = parser.parse_args()

    if args.local:
        video_id = Path(args.video).stem
        run_student_pipeline(video_id, args.student, args.video, args.reference)
    else:
        print(f"[WORKER] Starting HTTP server on port {args.port}")
        app.run(host="0.0.0.0", port=args.port)
