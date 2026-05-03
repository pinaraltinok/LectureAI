"""Custom exceptions for the orchestrator module."""

from __future__ import annotations

from typing import Optional


class OrchestratorError(Exception):
    """Base class for all orchestrator-level errors."""

    def __init__(
        self, message: str, *, video_id: Optional[str] = None
    ) -> None:
        self.video_id = video_id
        prefix = f"[{video_id}] " if video_id else ""
        super().__init__(f"{prefix}{message}")


class ChunkAnalysisError(OrchestratorError):
    """Raised when a single chunk cannot be analysed by Gemini.

    Individual chunk failures are typically logged and skipped; this
    exception exists so tests / callers can still inspect details.
    """

    def __init__(
        self,
        message: str,
        *,
        video_id: Optional[str] = None,
        chunk_index: Optional[int] = None,
    ) -> None:
        self.chunk_index = chunk_index
        super().__init__(
            f"chunk={chunk_index}: {message}", video_id=video_id
        )


class MergeError(OrchestratorError):
    """Raised when the final Gemini merge call fails."""


class JSONParseError(OrchestratorError):
    """Raised when a Gemini response cannot be parsed as JSON."""

    def __init__(
        self,
        message: str,
        *,
        raw_text: str = "",
        video_id: Optional[str] = None,
    ) -> None:
        self.raw_text = raw_text
        super().__init__(
            f"{message}\n---raw---\n{raw_text}", video_id=video_id
        )
