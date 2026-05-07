import argparse
import os
import subprocess
import tempfile
from pathlib import Path


DEFAULT_VIDEO_BUCKET = "lectureai_full_videos"
DEFAULT_AUDIO_BUCKET = "lectureai_audio"
DEFAULT_VIDEO_PREFIX = "Lesson_Records"
DEFAULT_AUDIO_KEY_TEMPLATE = "{video_id}.mp3"


def load_env_file(path=".env"):
    env_path = Path(path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_storage_client():
    from google.cloud import storage
    load_env_file()
    
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path:
        # Docker path fallback to local path
        if "/app/" in cred_path and not os.path.exists(cred_path):
            local_filename = cred_path.split("/")[-1]
            if os.path.exists(local_filename):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(local_filename)
        elif not os.path.exists(cred_path) and os.path.exists(os.path.basename(cred_path)):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(os.path.basename(cred_path))

    return storage.Client()


def get_signed_url(storage_client, bucket_name, blob_name, expires_seconds=21600):
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    if not blob.exists():
        raise FileNotFoundError(f"GCS object not found: gs://{bucket_name}/{blob_name}")

    return blob.generate_signed_url(
        version="v4",
        expiration=expires_seconds,
        method="GET",
    )


def upload_video_to_gcs(local_path, bucket_name, blob_name):
    """Uploads a local video file to GCS."""
    storage_client = get_storage_client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    
    print(f"[↑] Uploading: {local_path} -> gs://{bucket_name}/{blob_name}")
    blob.upload_from_filename(local_path)
    print(f"[OK] Upload complete.")
    return blob_name


def ensure_video_in_gcs(local_or_blob_path, bucket_name=DEFAULT_VIDEO_BUCKET):
    """
    Checks if the video exists in GCS. 
    If not, and the local file exists, uploads it.
    """
    storage_client = get_storage_client()
    bucket = storage_client.bucket(bucket_name)
    
    # Normalize blob name
    blob_name = normalize_video_blob(local_or_blob_path)
    blob = bucket.blob(blob_name)
    
    if blob.exists():
        print(f"[OK] Video already exists in GCS: gs://{bucket_name}/{blob_name}")
        return blob_name
    
    # Check local file if missing in GCS
    local_file = Path(local_or_blob_path)
    if local_file.exists() and local_file.is_file():
        return upload_video_to_gcs(str(local_file), bucket_name, blob_name)
    
    # If not found anywhere, check for similar blobs as a courtesy
    try:
        return resolve_gcs_blob(storage_client, bucket_name, local_or_blob_path)
    except FileNotFoundError:
        raise FileNotFoundError(
            f"Video not found in GCS (gs://{bucket_name}/{blob_name}) "
            f"and local file ({local_or_blob_path}) does not exist!"
        )


def normalize_video_blob(video_name_or_blob, prefix=DEFAULT_VIDEO_PREFIX):
    blob = video_name_or_blob.replace("\\", "/").lstrip("/")
    if "/" in blob:
        return blob
    return f"{prefix.rstrip('/')}/{blob}"


def resolve_gcs_blob(storage_client, bucket_name, blob_name, prefix=DEFAULT_VIDEO_PREFIX):
    blob_name = blob_name.replace("\\", "/").lstrip("/")
    candidates = []
    for candidate in (blob_name, normalize_video_blob(blob_name, prefix)):
        if candidate not in candidates:
            candidates.append(candidate)

    bucket = storage_client.bucket(bucket_name)
    for candidate in candidates:
        if bucket.blob(candidate).exists():
            return candidate

    basename = Path(blob_name).name
    stem = Path(blob_name).stem
    search_prefixes = ["", f"{prefix.rstrip('/')}/"]
    matches = []
    for search_prefix in search_prefixes:
        for blob in storage_client.list_blobs(bucket_name, prefix=search_prefix):
            if Path(blob.name).name == basename:
                matches.append(blob.name)
                if len(matches) > 1:
                    break
        if matches:
            break

    if len(matches) == 1:
        return matches[0]

    suggestions = []
    if not matches:
        for blob in storage_client.list_blobs(bucket_name):
            blob_basename = Path(blob.name).name
            if stem and stem in blob.name:
                suggestions.append(blob.name)
            elif blob_basename.lower() == basename.lower():
                suggestions.append(blob.name)
            elif basename[:12] and basename[:12] in blob_basename:
                suggestions.append(blob.name)
            if len(suggestions) >= 10:
                break

    tried = ", ".join(f"gs://{bucket_name}/{candidate}" for candidate in candidates)
    if matches:
        found = ", ".join(f"gs://{bucket_name}/{match}" for match in matches)
        raise FileNotFoundError(
            f"Multiple GCS objects match {basename}. Use the full blob path. Matches: {found}"
        )
    if suggestions:
        found = "\n  - ".join(suggestions)
        raise FileNotFoundError(
            f"GCS object not found. Tried: {tried}\n"
            f"Similar objects found in gs://{bucket_name}:\n  - {found}\n"
            "Use one of these full blob paths with --video."
        )
    raise FileNotFoundError(f"GCS object not found. Tried: {tried}")


def make_audio_blob_name(video_blob, template=DEFAULT_AUDIO_KEY_TEMPLATE):
    video_id = Path(video_blob).stem
    return template.format(video_id=video_id, video_blob=video_blob)


def convert_gcs_video_to_mp3(
    video_bucket,
    video_blob,
    audio_bucket,
    audio_blob,
    ffmpeg_binary="ffmpeg",
    sample_rate="16000",
    channels="1",
    keep_local=None,
):
    storage_client = get_storage_client()
    signed_url = get_signed_url(storage_client, video_bucket, video_blob)

    with tempfile.TemporaryDirectory(prefix="lectureai_audio_") as temp_dir:
        local_mp3 = Path(temp_dir) / Path(audio_blob).name
        print(f"[>>] Converting gs://{video_bucket}/{video_blob} to MP3...")
        subprocess.run(
            [
                ffmpeg_binary,
                "-y",
                "-i",
                signed_url,
                "-vn",
                "-acodec",
                "libmp3lame",
                "-ar",
                str(sample_rate),
                "-ac",
                str(channels),
                str(local_mp3),
            ],
            check=True,
        )

        print(f"[>>] Uploading MP3 to gs://{audio_bucket}/{audio_blob}...")
        bucket = storage_client.bucket(audio_bucket)
        blob = bucket.blob(audio_blob)
        blob.upload_from_filename(str(local_mp3), content_type="audio/mpeg")

        if keep_local:
            keep_path = Path(keep_local)
            keep_path.parent.mkdir(parents=True, exist_ok=True)
            keep_path.write_bytes(local_mp3.read_bytes())
            print(f"[OK] Local copy saved: {keep_path}")

    gcs_uri = f"gs://{audio_bucket}/{audio_blob}"
    print(f"[OK] Audio uploaded: {gcs_uri}")
    return gcs_uri


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert a GCS lecture video to MP3 and upload it to the audio bucket."
    )
    parser.add_argument(
        "video",
        help="Video object name or blob path. Example: lesson.mp4 or Lesson_Records/lesson.mp4",
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
        help="Target MP3 blob name. Defaults to GCS_KEY_MP3 or {video_id}.mp3",
    )
    parser.add_argument(
        "--video-prefix",
        default=DEFAULT_VIDEO_PREFIX,
        help="Prefix added when only a filename is passed.",
    )
    parser.add_argument(
        "--keep-local",
        help="Optional local path for keeping a copy of the generated MP3.",
    )
    parser.add_argument(
        "--ffmpeg",
        default=os.getenv("FFMPEG_BINARY") or "ffmpeg",
        help="ffmpeg executable path.",
    )
    return parser.parse_args()


def main():
    load_env_file()
    args = parse_args()

    storage_client = get_storage_client()
    video_blob = resolve_gcs_blob(
        storage_client,
        args.video_bucket,
        args.video,
        args.video_prefix,
    )
    audio_template = os.getenv("GCS_KEY_MP3") or DEFAULT_AUDIO_KEY_TEMPLATE
    audio_blob = args.audio_blob or make_audio_blob_name(video_blob, audio_template)

    convert_gcs_video_to_mp3(
        video_bucket=args.video_bucket,
        video_blob=video_blob,
        audio_bucket=args.audio_bucket,
        audio_blob=audio_blob,
        ffmpeg_binary=args.ffmpeg,
        keep_local=args.keep_local,
    )


if __name__ == "__main__":
    main()
