from .exceptions import (
    OrchestratorError,
    ChunkAnalysisError,
    MergeError,
    JSONParseError,
)
from .report_schema import (
    Rating,
    MetricResult,
    LessonStructureItem,
    QAReport,
)

# Do not import gemini_client here: importing this package (e.g. report_schema)
# must not pull google.genai / audio.assemblyai. Use:
#   from src.orchestrator.gemini_client import ReportOrchestrator

__all__ = [
    "OrchestratorError",
    "ChunkAnalysisError",
    "MergeError",
    "JSONParseError",
    "Rating",
    "MetricResult",
    "LessonStructureItem",
    "QAReport",
]
