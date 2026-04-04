"""
Segment Repository — typed data access layer for segment_results.

Wraps Supabase operations for reading and writing segment data,
including per-pipeline JSONB column updates and status management.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Pipeline column names — these are the JSONB columns in segment_results
PIPELINE_COLUMNS = ("visual_metrics", "sound_metrics", "transcript")


class SegmentRepository:
    """
    Data access object for the ``segment_results`` table in Supabase.

    Usage::

        repo = SegmentRepository()
        row = repo.get_segment("abc-123")
        repo.update_sound_metrics("abc-123", metrics_dict)
        repo.compute_and_update_status("abc-123")
    """

    def __init__(self, supabase_client=None):
        """
        Initialize the repository.

        If no client is provided, one is created from
        ``SUPABASE_URL`` and ``SUPABASE_KEY`` environment variables.
        """
        if supabase_client is not None:
            self._client = supabase_client
        else:
            self._client = self._create_client()

    @staticmethod
    def _create_client():
        try:
            from supabase import create_client
        except ImportError:
            raise ImportError(
                "supabase-py is required. Install with: pip install supabase"
            )

        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")

        if not url or not key:
            raise EnvironmentError(
                "SUPABASE_URL and SUPABASE_KEY must be set in environment"
            )

        return create_client(url, key)

    @property
    def _table(self):
        return self._client.table("segment_results")

    # ── Read ─────────────────────────────────────────────────

    def get_segment(self, segment_id: str) -> Optional[dict]:
        """Fetch a single segment row by ID. Returns None if not found."""
        response = (
            self._table
            .select("*")
            .eq("segment_id", segment_id)
            .maybe_single()
            .execute()
        )
        return response.data

    def get_pending_segments(
        self,
        pipeline: str,
        limit: int = 50,
    ) -> list[dict]:
        """
        Get segment rows where a specific pipeline column is NULL.

        Parameters
        ----------
        pipeline : str
            One of: 'visual_metrics', 'sound_metrics', 'transcript'.
        limit : int
            Maximum rows to return.

        Returns
        -------
        list of dict
            Segment rows that still need processing by this pipeline.
        """
        if pipeline not in PIPELINE_COLUMNS:
            raise ValueError(
                f"Unknown pipeline '{pipeline}'. "
                f"Must be one of: {PIPELINE_COLUMNS}"
            )

        response = (
            self._table
            .select("*")
            .is_(pipeline, "null")
            .limit(limit)
            .execute()
        )
        return response.data or []

    # ── Write (per-pipeline) ─────────────────────────────────

    def update_visual_metrics(self, segment_id: str, metrics: dict) -> None:
        """Write the visual_metrics JSONB column."""
        self._update_column(segment_id, "visual_metrics", metrics)

    def update_sound_metrics(self, segment_id: str, metrics: dict) -> None:
        """Write the sound_metrics JSONB column."""
        self._update_column(segment_id, "sound_metrics", metrics)

    def update_transcript(self, segment_id: str, transcript: dict) -> None:
        """Write the transcript JSONB column."""
        self._update_column(segment_id, "transcript", transcript)

    def _update_column(
        self, segment_id: str, column: str, data: dict
    ) -> None:
        """Update a single JSONB column for a segment."""
        logger.info(
            "[%s] Updating column '%s' in segment_results",
            segment_id, column,
        )
        self._table.update(
            {column: data}
        ).eq("segment_id", segment_id).execute()

    # ── Status management ────────────────────────────────────

    def update_status(self, segment_id: str, status: str) -> None:
        """
        Manually set the status of a segment.

        Valid values: 'pending', 'partial', 'complete', 'failed'.
        """
        logger.info("[%s] Setting status to '%s'", segment_id, status)
        self._table.update(
            {"status": status}
        ).eq("segment_id", segment_id).execute()

    def compute_and_update_status(self, segment_id: str) -> str:
        """
        Check which JSONB columns are populated and set status accordingly.

        Returns the new status:
        - ``'pending'``  — all three columns are NULL
        - ``'partial'``  — 1 or 2 columns are non-NULL
        - ``'complete'`` — all 3 columns are non-NULL

        Returns
        -------
        str
            The new status value.
        """
        row = self.get_segment(segment_id)
        if row is None:
            logger.warning("[%s] Segment not found", segment_id)
            return "pending"

        filled = sum(
            1 for col in PIPELINE_COLUMNS if row.get(col) is not None
        )

        if filled == 0:
            new_status = "pending"
        elif filled < len(PIPELINE_COLUMNS):
            new_status = "partial"
        else:
            new_status = "complete"

        self.update_status(segment_id, new_status)
        logger.info(
            "[%s] Status computed: %d/%d pipelines done → '%s'",
            segment_id, filled, len(PIPELINE_COLUMNS), new_status,
        )
        return new_status
