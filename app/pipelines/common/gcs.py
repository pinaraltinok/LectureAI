"""
Shared GCS download and cleanup utilities.

Used by all pipeline adapters (sound, transcript, visual) to avoid
duplicating the GCS download / temp-file logic.
"""

from __future__ import annotations

import logging
import os
import tempfile
from typing import Optional

from google.cloud import storage

logger = logging.getLogger(__name__)

# Reuse across calls within the same process
_storage_client: Optional[storage.Client] = None


def _get_client() -> storage.Client:
    global _storage_client
    if _storage_client is None:
        _storage_client = storage.Client()
    return _storage_client


def parse_gcs_uri(gcs_uri: str) -> tuple[str, str]:
    """
    Split ``gs://bucket/path/to/blob`` into ``(bucket, blob_path)``.
    """
    if not gcs_uri.startswith("gs://"):
        raise ValueError(f"Invalid GCS URI: {gcs_uri}")
    without_scheme = gcs_uri[len("gs://"):]
    bucket_name, blob_name = without_scheme.split("/", 1)
    return bucket_name, blob_name


def download_segment(
    gcs_uri: str,
    dest_dir: Optional[str] = None,
    prefix: str = "lectureai_",
) -> str:
    """
    Download a GCS object to a local temp file.

    Parameters
    ----------
    gcs_uri : str
        ``gs://bucket/path/to/seg_0.mp4``
    dest_dir : str, optional
        Directory to download into.  Defaults to a new temp directory.
    prefix : str
        Prefix for the auto-created temp directory.

    Returns
    -------
    str
        Absolute path to the downloaded local file.
    """
    bucket_name, blob_name = parse_gcs_uri(gcs_uri)

    if dest_dir is None:
        dest_dir = tempfile.mkdtemp(prefix=prefix)

    local_path = os.path.join(dest_dir, os.path.basename(blob_name))

    logger.info("Downloading %s → %s", gcs_uri, local_path)
    client = _get_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.download_to_filename(local_path)

    size_mib = os.path.getsize(local_path) / (1024 * 1024)
    logger.info("Download complete: %s (%.1f MiB)", local_path, size_mib)
    return local_path


def cleanup(*paths: str) -> None:
    """
    Remove local files and their parent temp dirs (if empty).
    """
    for path in paths:
        try:
            if os.path.isfile(path):
                parent = os.path.dirname(path)
                os.remove(path)
                logger.info("Removed temp file: %s", path)

                if parent and parent != os.getcwd() and not os.listdir(parent):
                    os.rmdir(parent)
                    logger.info("Removed empty temp dir: %s", parent)
        except OSError as exc:
            logger.warning("Cleanup failed for %s: %s", path, exc)
