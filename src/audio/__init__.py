from .schemas import (
    AudioAnalysisResult,
    SentimentSummary,
    TranscriptSegment,
)

# Do not import assemblyai_client here (heavy optional dep). Use:
#   from src.audio.assemblyai_client import AudioAnalysisClient

__all__ = [
    "TranscriptSegment",
    "AudioAnalysisResult",
    "SentimentSummary",
]
