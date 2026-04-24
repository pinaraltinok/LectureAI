"""Load ``scripts/.env`` and repo ``.env`` for CLI runs (independent of cwd)."""

from __future__ import annotations

from pathlib import Path
from typing import Optional


def load_dotenv_files(repo_root: Optional[Path] = None) -> None:
    """Merge env vars from ``{repo}/scripts/.env`` then ``{repo}/.env``.

    Does not override variables already set in the process environment.
    """
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    root = repo_root or Path(__file__).resolve().parents[1]
    for path in (root / "scripts" / ".env", root / ".env"):
        if path.is_file():
            load_dotenv(path, override=False)
