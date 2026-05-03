"""Normalize ``video_id`` for CV / GCS (strip paths, ``gs://``, ``.mp4``)."""

from __future__ import annotations


def normalize_cv_video_id(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return s
    s = s.replace("\\", "/")
    lower = s.lower()
    if lower.startswith("gs://"):
        rest = s[5:]
        slash = rest.find("/")
        path = rest[slash + 1 :] if slash != -1 else ""
        parts = [p for p in path.split("/") if p]
        lowered = [p.lower() for p in parts]
        if "lesson_records" in lowered:
            idx = lowered.index("lesson_records")
            s = "/".join(parts[idx + 1 :])
        elif parts:
            s = parts[-1]
        else:
            s = ""
    elif "lesson_records/" in lower:
        pos = lower.index("lesson_records/")
        s = s[pos + len("lesson_records/") :]
    for ext in (".mp4", ".MP4", ".Mp4", ".mP4"):
        if s.endswith(ext):
            s = s[: -len(ext)]
            break
    return s.strip().strip("/")
