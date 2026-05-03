from .exceptions import (
    OrchestratorError,
    ChunkAnalysisError,
    MergeError,
    JSONParseError,
)
from .report_schema import (
    LessonStructureItem,
    MetricResult,
    QAReport,
    Rating,
)

__all__ = [
    "OrchestratorError",
    "ChunkAnalysisError",
    "MergeError",
    "JSONParseError",
    "Rating",
    "MetricResult",
    "LessonStructureItem",
    "QAReport",
    "ReportOrchestrator",
]


def __getattr__(name: str) -> object:
    if name == "ReportOrchestrator":
        from .gemini_client import ReportOrchestrator as _ReportOrchestrator

        return _ReportOrchestrator
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
