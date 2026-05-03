import json
import os
import subprocess
import tempfile
from datetime import timedelta
from pathlib import Path

import modal


app = modal.App("lectureai-speaker-match")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "google-cloud-storage==2.19.0",
        "numpy<2",
        "torch==2.4.1",
        "torchaudio==2.4.1",
        "pyannote.audio==3.3.2",
        "huggingface_hub<0.17.0",
    )
)


def _write_gcp_credentials():
    credentials_json = (
        os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
        or os.getenv("SERVICE_ACCOUNT_JSON")
    )
    if not credentials_json:
        return

    credentials_path = "/tmp/gcp-service-account.json"
    Path(credentials_path).write_text(credentials_json, encoding="utf-8")
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path


def _get_gcs_signed_url(bucket_name, blob_name):
    from google.cloud import storage
    
    _write_gcp_credentials()
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    
    if not blob.exists():
        raise FileNotFoundError(f"GCS object not found: gs://{bucket_name}/{blob_name}")
        
    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=1),
        method="GET",
    )


def _download_gcs_blob(bucket_name, blob_name, local_path):
    from google.cloud import storage
    
    _write_gcp_credentials()
    client = storage.Client()
    blob = client.bucket(bucket_name).blob(blob_name)
    if not blob.exists():
        raise FileNotFoundError(f"GCS object not found: gs://{bucket_name}/{blob_name}")
    blob.download_to_filename(str(local_path))
    return local_path


def _extract_wav(input_path, output_path, max_minutes=None):
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
    ]
    if max_minutes:
        cmd.extend(["-t", str(float(max_minutes) * 60.0)])
    cmd.append(str(output_path))
    subprocess.run(cmd, check=True)
    return output_path


def _cosine(a, b):
    import numpy as np

    a = np.asarray(a).reshape(-1)
    b = np.asarray(b).reshape(-1)
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)


@app.function(
    image=image,
    gpu="T4",
    timeout=60 * 60,
    secrets=[
        modal.Secret.from_name("lectureai-gcp"),
    ],
)
def match_speaker(
    video_blob,
    student_audio_blob,
    student_id,
    video_bucket="lectureai_full_videos",
    student_audio_bucket="lectureai_student_audios",
    max_minutes=15,
    min_segment_seconds=2.0,
    max_segments_per_speaker=5,
):
    import numpy as np
    import torch
    from pyannote.audio import Inference, Model, Pipeline
    from pyannote.core import Segment

    _write_gcp_credentials()

    hf_token = (
        os.getenv("HF_TOKEN")
        or os.getenv("YENI_HF_TOKEN")
        or os.getenv("HUGGINGFACE_TOKEN")
        or os.getenv("HUGGING_FACE_HUB_TOKEN")
    )
    if not hf_token:
        raise RuntimeError("Modal secret 'huggingface' içinde HF_TOKEN olmalı.")

    with tempfile.TemporaryDirectory(prefix="lectureai_modal_") as tmp:
        tmp_dir = Path(tmp)
        video_wav = tmp_dir / "video.wav"
        ref_wav = tmp_dir / "reference.wav"

        print(f"[GCS] Signed URL oluşturuluyor: gs://{video_bucket}/{video_blob}")
        video_url = _get_gcs_signed_url(video_bucket, video_blob)
        
        print(f"[GCS] Signed URL oluşturuluyor: gs://{student_audio_bucket}/{student_audio_blob}")
        ref_url = _get_gcs_signed_url(student_audio_bucket, student_audio_blob)

        print("[FFMPEG] Video sesi URL üzerinden WAV'a çevriliyor (indirmeden)...")
        _extract_wav(video_url, video_wav, max_minutes=max_minutes)
        print("[FFMPEG] Referans ses URL üzerinden WAV'a çevriliyor...")
        _extract_wav(ref_url, ref_wav)

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[MODEL] Device: {device}")

        print("[MODEL] pyannote diarization yükleniyor...")
        diarization_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token,
        )
        diarization_pipeline.to(device)

        print("[MODEL] Embedding modeli yükleniyor (SpeechBrain EncoderClassifier)...")
        from speechbrain.inference.speaker import EncoderClassifier
        
        # SpeechBrain ecapa-voxceleb modeli gated değildir ve çok başarılıdır.
        # run_opts expects device as string (e.g., 'cuda' or 'cpu')
        embedding_model = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            run_opts={"device": str(device)},
            savedir=os.path.join(tmp, "speechbrain_model")
        )

        def get_embedding(wav_path, segment=None):
            import torchaudio
            signal, fs = torchaudio.load(str(wav_path))
            if segment:
                start_sample = int(segment.start * fs)
                end_sample = int(segment.end * fs)
                signal = signal[:, start_sample:end_sample]
            
            # SpeechBrain expects [batch, time]
            emb = embedding_model.encode_batch(signal)
            # Returns [batch, 1, 192], we want [192]
            return emb.squeeze().cpu().numpy()

        print("[DIARIZATION] Başladı...")
        diarization = diarization_pipeline(str(video_wav))
        
        print("[EMBEDDING] Referans ses embedding çıkarılıyor...")
        ref_embedding = get_embedding(ref_wav)

        speaker_segments = {}
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            duration = float(turn.end - turn.start)
            if duration < min_segment_seconds:
                continue
            speaker_segments.setdefault(speaker, []).append(
                {"start": float(turn.start), "end": float(turn.end), "duration": duration}
            )

        scores = {}
        used_segments = {}
        for speaker, segments in speaker_segments.items():
            longest_segments = sorted(
                segments,
                key=lambda item: item["duration"],
                reverse=True,
            )[:max_segments_per_speaker]

            speaker_scores = []
            for item in longest_segments:
                segment = Segment(item["start"], item["end"])
                embedding = get_embedding(video_wav, segment)
                speaker_scores.append(_cosine(ref_embedding, embedding))

            if speaker_scores:
                scores[speaker] = float(np.mean(speaker_scores))
                used_segments[speaker] = longest_segments

        if not scores:
            raise RuntimeError("Yeterli speaker segmenti bulunamadı.")

        best_speaker = max(scores, key=scores.get)
        
        # Prepare final segments for the best speaker (just the times)
        final_segments = [
            {"start": round(s["start"], 2), "end": round(s["end"], 2)} 
            for s in used_segments.get(best_speaker, [])
        ]

        result = {
            "student": student_id,
            "best_speaker": best_speaker,
            "score": round(scores[best_speaker], 4),
            "segments": final_segments,
            "metadata": {
                "all_scores": {k: round(v, 4) for k, v in scores.items()},
                "video_blob": video_blob,
                "student_audio_blob": student_audio_blob,
                "processed_minutes": max_minutes
            }
        }
        
        print("\n" + "="*40)
        print(f"🎯 MATCH FOUND: {student_id} -> {best_speaker}")
        print(f"📊 Confidence Score: {result['score']}")
        print("="*40 + "\n")
        
        return result


@app.local_entrypoint()
def main(
    video_blob: str,
    student_audio_blob: str,
    student: str,
    video_bucket: str = "lectureai_full_videos",
    student_audio_bucket: str = "lectureai_student_audios",
    max_minutes: int = 15,
):
    result = match_speaker.remote(
        video_blob=video_blob,
        student_audio_blob=student_audio_blob,
        student_id=student,
        video_bucket=video_bucket,
        student_audio_bucket=student_audio_bucket,
        max_minutes=max_minutes,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
