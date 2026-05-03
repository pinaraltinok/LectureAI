import argparse
import json
import os
import tempfile
import time
from pathlib import Path

import httpx

from stream_audio import (
    DEFAULT_AUDIO_BUCKET,
    DEFAULT_AUDIO_KEY_TEMPLATE,
    DEFAULT_VIDEO_BUCKET,
    convert_gcs_video_to_mp3,
    get_signed_url,
    get_storage_client,
    load_env_file,
    make_audio_blob_name,
    resolve_gcs_blob,
)
from voice_biometric_matcher import VoiceBiometricMatcher


OUT_DIR = Path("core/registry_output")
DEFAULT_REGISTRY_PATH = OUT_DIR / "student_registry.json"
DEFAULT_RESULT_TEMPLATE = "{video_id}_{student_id}_speaker_match.json"
DEFAULT_REFERENCE_BUCKET = "lectureai_student_audios"


def safe_name(value):
    safe = value.strip().lower().replace(" ", "_")
    replacements = {
        "ı": "i",
        "İ": "i",
        "ö": "o",
        "Ö": "o",
        "ü": "u",
        "Ü": "u",
        "ç": "c",
        "Ç": "c",
        "ş": "s",
        "Ş": "s",
        "ğ": "g",
        "Ğ": "g",
    }
    for src, dst in replacements.items():
        safe = safe.replace(src, dst)
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in safe)


def transcribe_with_assemblyai(audio_url, output_path):
    api_key = os.getenv("ASSEMBLYAI_API_KEY")
    if not api_key or api_key == "your-assemblyai-api-key":
        raise RuntimeError("ASSEMBLYAI_API_KEY .env içinde gerçek değer olmalı.")

    headers = {"authorization": api_key}
    base_url = "https://api.assemblyai.com/v2"
    body = {
        "audio_url": audio_url,
        "speaker_labels": True,
        "language_detection": True,
        "speech_models": ["universal-3-pro", "universal-2"],
    }

    print("[>>] AssemblyAI diarization başlatılıyor...")
    response = httpx.post(f"{base_url}/transcript", headers=headers, json=body, timeout=30)
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(
            f"AssemblyAI transcript isteği reddetti "
            f"({response.status_code}): {response.text}"
        ) from exc
    transcript_id = response.json()["id"]

    while True:
        response = httpx.get(
            f"{base_url}/transcript/{transcript_id}",
            headers=headers,
            timeout=30,
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"AssemblyAI status isteği reddetti "
                f"({response.status_code}): {response.text}"
            ) from exc
        data = response.json()
        status = data.get("status")

        if status == "completed":
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"[OK] Transcript kaydedildi: {output_path}")
            return data

        if status == "error":
            raise RuntimeError(f"AssemblyAI hata verdi: {data.get('error')}")

        print(f"  ... AssemblyAI status: {status}")
        time.sleep(10)


def download_gcs_blob(bucket_name, blob_name, local_path):
    client = get_storage_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    if not blob.exists():
        raise FileNotFoundError(f"GCS object not found: gs://{bucket_name}/{blob_name}")
    blob.download_to_filename(str(local_path))
    return local_path


def prepare_audio_fallback(args, video_blob, audio_blob):
    print("[WARN] Direct video AssemblyAI tarafından kabul edilmedi; MP3 fallback deneniyor.")
    convert_gcs_video_to_mp3(
        video_bucket=args.video_bucket,
        video_blob=video_blob,
        audio_bucket=args.audio_bucket,
        audio_blob=audio_blob,
        ffmpeg_binary=args.ffmpeg,
    )
    client = get_storage_client()
    return get_signed_url(client, args.audio_bucket, audio_blob)


def update_registry(student_id, match_result, registry_path=DEFAULT_REGISTRY_PATH):
    registry_path = Path(registry_path)
    if registry_path.exists():
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
    else:
        registry = []

    best_speaker = match_result["best_speaker"]
    score = match_result["score"]
    found = False

    for entry in registry:
        if entry.get("id", "").lower() == student_id.lower():
            entry["speaker_id"] = best_speaker
            entry["voice_notes"] = f"Speaker {best_speaker} (Biometric Match: {score:.2f})"
            entry["voice_confirmed"] = True
            entry["detection_method"] = "assemblyai_diarization_biometric_match"
            found = True
            break

    if not found:
        registry.append(
            {
                "id": student_id,
                "speaker_id": best_speaker,
                "is_student": True,
                "voice_notes": f"Speaker {best_speaker} (Biometric Match: {score:.2f})",
                "voice_confirmed": True,
                "detection_method": "assemblyai_diarization_biometric_match",
            }
        )

    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(
        json.dumps(registry, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[OK] Registry güncellendi: {registry_path}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="AssemblyAI diarization + voice biometric speaker matching pipeline."
    )
    parser.add_argument("--video", required=True, help="GCS video filename or blob path.")
    parser.add_argument("--student", required=True, help="Student name/id.")
    reference_group = parser.add_mutually_exclusive_group(required=True)
    reference_group.add_argument(
        "--reference",
        help="Local reference voice path, for example data/irem.mp3.",
    )
    reference_group.add_argument(
        "--reference-blob",
        help="Reference voice blob in the student audio bucket.",
    )
    parser.add_argument(
        "--reference-bucket",
        default=os.getenv("GCS_BUCKET_STUDENT_AUDIOS") or DEFAULT_REFERENCE_BUCKET,
        help="Bucket for student reference voices.",
    )
    parser.add_argument(
        "--video-bucket",
        default=os.getenv("GCS_BUCKET_VIDEOS")
        or os.getenv("GCS_FULL_VIDEOS_BUCKET")
        or DEFAULT_VIDEO_BUCKET,
    )
    parser.add_argument(
        "--audio-bucket",
        default=os.getenv("GCS_BUCKET_AUDIO") or DEFAULT_AUDIO_BUCKET,
    )
    parser.add_argument(
        "--audio-blob",
        help="Existing or target audio blob. Defaults to GCS_KEY_MP3 or {video_id}.mp3.",
    )
    parser.add_argument(
        "--transcript",
        help="Use an existing AssemblyAI transcript JSON instead of creating a new one.",
    )
    parser.add_argument(
        "--skip-convert",
        action="store_true",
        help="Skip video to MP3 conversion when the audio blob already exists.",
    )
    parser.add_argument(
        "--direct-video",
        action="store_true",
        help="Send the GCS video signed URL directly to AssemblyAI and match speaker segments from the video URL.",
    )
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        help="Do not convert to MP3 if direct video transcription fails.",
    )
    parser.add_argument(
        "--ffmpeg",
        default=os.getenv("FFMPEG_BINARY") or "ffmpeg",
        help="ffmpeg executable path.",
    )
    parser.add_argument(
        "--no-registry",
        action="store_true",
        help="Do not update student_registry.json.",
    )
    parser.add_argument("--only-transcript", action="store_true", help="Sadece transkript çıkar, biyometrik eşleşmeyi atla.")
    return parser.parse_args()


def main():
    load_env_file()
    args = parse_args()

    client = get_storage_client()
    video_blob = resolve_gcs_blob(client, args.video_bucket, args.video)
    video_id = Path(video_blob).stem
    audio_template = os.getenv("GCS_KEY_MP3") or DEFAULT_AUDIO_KEY_TEMPLATE
    audio_blob = args.audio_blob or make_audio_blob_name(video_blob, audio_template)
    transcript_path = (
        Path(args.transcript)
        if args.transcript
        else OUT_DIR / f"{safe_name(video_id)}_full_transcript.json"
    )

    reference_temp_dir = None
    if args.reference_blob:
        reference_temp_dir = tempfile.TemporaryDirectory(prefix="lectureai_ref_")
        reference_path = Path(reference_temp_dir.name) / Path(args.reference_blob).name
        print(
            f"[>>] Referans ses indiriliyor: "
            f"gs://{args.reference_bucket}/{args.reference_blob}"
        )
        download_gcs_blob(args.reference_bucket, args.reference_blob, reference_path)
    else:
        reference_path = Path(args.reference)
        if not reference_path.exists():
            raise FileNotFoundError(f"Reference audio not found: {reference_path}")

    if args.direct_video:
        source_url = get_signed_url(client, args.video_bucket, video_blob)
        source_for_matching = source_url
        print("[OK] Direct video mode: MP3 conversion skipped.")
    elif not args.skip_convert:
        convert_gcs_video_to_mp3(
            video_bucket=args.video_bucket,
            video_blob=video_blob,
            audio_bucket=args.audio_bucket,
            audio_blob=audio_blob,
            ffmpeg_binary=args.ffmpeg,
        )

    if not args.direct_video:
        source_url = get_signed_url(client, args.audio_bucket, audio_blob)

    if transcript_path.exists():
        print(f"[OK] Mevcut transcript kullanılacak: {transcript_path}")
    else:
        try:
            transcribe_with_assemblyai(source_url, transcript_path)
        except RuntimeError:
            if not args.direct_video or args.no_fallback:
                raise
            source_url = prepare_audio_fallback(args, video_blob, audio_blob)
            source_for_matching = None
            transcribe_with_assemblyai(source_url, transcript_path)

    if not args.direct_video or source_for_matching is None:
        with tempfile.TemporaryDirectory(prefix="lectureai_match_") as temp_dir:
            local_audio = Path(temp_dir) / Path(audio_blob).name
            print(f"[>>] MP3 local analiz için indiriliyor: gs://{args.audio_bucket}/{audio_blob}")
            download_gcs_blob(args.audio_bucket, audio_blob, local_audio)
            source_for_matching = str(local_audio)

            matcher = VoiceBiometricMatcher()
            match_result = matcher.match_student_by_voice(
                str(reference_path),
                source_for_matching,
                str(transcript_path),
            )
    else:
        matcher = VoiceBiometricMatcher()
        match_result = matcher.match_student_by_voice(
            str(reference_path),
            source_for_matching,
            str(transcript_path),
        )

    if not match_result:
        raise RuntimeError("Speaker eşleşmesi üretilemedi.")

    result_path = OUT_DIR / DEFAULT_RESULT_TEMPLATE.format(
        video_id=safe_name(video_id),
        student_id=safe_name(args.student),
    )
    result_payload = {
        "student_id": args.student,
        "video_bucket": args.video_bucket,
        "video_blob": video_blob,
        "direct_video": args.direct_video,
        "audio_bucket": args.audio_bucket,
        "audio_blob": None if args.direct_video else audio_blob,
        "transcript_path": str(transcript_path),
        "match": match_result,
    }
    result_path.write_text(
        json.dumps(result_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[OK] Match sonucu kaydedildi: {result_path}")

    if not args.no_registry:
        update_registry(args.student, match_result)

    if reference_temp_dir:
        reference_temp_dir.cleanup()


if __name__ == "__main__":
    main()
