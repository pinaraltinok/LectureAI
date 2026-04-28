"""Unit tests for ``src.orchestrator.gemini_client``.

External I/O (GCS + Gemini) is mocked. We verify:
  1. ``generate_report`` loads CV (preferring
     ``results/{id}/lecture_report.json``, then legacy ``results/{id}.json``),
     drives chunk analysis, merges, builds a ``QAReport`` and
     uploads it to lectureai_processed/reports/.
  2. ``_parse_gemini_json`` strips markdown fences and raises
     ``JSONParseError`` for invalid payloads.
"""

from __future__ import annotations

import json
import sys
import types
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ``vertexai`` is optional in some dev venvs; stub before importing the orchestrator.
if "vertexai" not in sys.modules:
    _vertexai_mod = types.ModuleType("vertexai")
    _vertexai_mod.init = MagicMock()
    _gen_mod = types.ModuleType("vertexai.generative_models")

    def _fake_generative_model(*_a: object, **_kw: object) -> MagicMock:
        return MagicMock()

    _gen_mod.GenerativeModel = _fake_generative_model
    _vertexai_mod.generative_models = _gen_mod
    sys.modules["vertexai"] = _vertexai_mod
    sys.modules["vertexai.generative_models"] = _gen_mod

with patch("google.cloud.storage.Client"), patch(
    "google.genai.Client"
):
    from src.orchestrator.gemini_client import (
        ReportOrchestrator,
        _parse_gemini_json,
    )
from src.audio.schemas import (
    AudioAnalysisResult,
    SentimentSummary,
    TranscriptSegment,
)
from src.config import BucketConfig
from src.orchestrator.exceptions import JSONParseError
from src.orchestrator.report_schema import QAReport, Rating


# --------------------------------------------------------------------------- #
#  Fixtures
# --------------------------------------------------------------------------- #
def _bucket_config() -> BucketConfig:
    return BucketConfig(
        videos="lectureai_full_videos",
        processed="lectureai_processed",
        transcripts="lectureai_transcripts",
        audio="lectureai_audio",
    )


def _audio_result() -> AudioAnalysisResult:
    return AudioAnalysisResult(
        video_id="vid-1",
        full_transcript="hello world today we learn",
        segments=[
            TranscriptSegment(
                speaker="A",
                start_ms=0,
                end_ms=60_000,
                text="hello world",
                sentiment="POSITIVE",
                sentiment_confidence=0.9,
            ),
            TranscriptSegment(
                speaker="A",
                start_ms=60_000,
                end_ms=120_000,
                text="today we learn",
                sentiment="NEUTRAL",
                sentiment_confidence=0.6,
            ),
        ],
        highlights=["learn"],
        speaking_pace_wpm=140.0,
        silence_ratio=0.1,
        sentiment_summary=SentimentSummary.empty(),
        processed_at=datetime.now(tz=timezone.utc),
    )


def _cv_json() -> str:
    return json.dumps(
        {
            "motion_frames": [
                {"timestamp_sec": 10, "motion": 0.4},
                {"timestamp_sec": 70, "motion": 0.2},
            ],
            "board_usage": {"total_pct": 0.55},
        }
    )


def _chunk_response_json() -> str:
    return json.dumps(
        {
            "chunk_index": 0,
            "start_sec": 0,
            "end_sec": 1800,
            "iletisim": {
                k: {
                    "rating": "Good",
                    "observation": f"(00:10) {k}",
                    "improvement_tip": "",
                }
                for k in [
                    "ders_dinamikleri",
                    "mod_tutum",
                    "saygi_sinirlar",
                    "tesvik_motivasyon",
                    "hatalar",
                    "acik_uclu_sorular",
                    "empati_destekleyici",
                    "etik_degerler",
                ]
            },
            "hazirlik": {
                k: {
                    "rating": "Good",
                    "observation": f"(00:30) {k}",
                    "improvement_tip": "",
                }
                for k in [
                    "ders_akisi_tempo",
                    "konu_bilgisi",
                    "aciklama_netligi",
                    "rasyonel_ipucu",
                ]
            },
            "organizasyon": {
                k: {
                    "rating": "Good",
                    "observation": f"(00:45) {k}",
                    "improvement_tip": "",
                }
                for k in [
                    "gorsel_bilesenler",
                    "konusma_ses_tonu",
                    "teknik_bilesen",
                    "zamanlama",
                ]
            },
            "ders_yapisi": {
                "isinma": True,
                "onceki_ders_gozden": False,
                "onceki_odev": False,
                "hedefler": True,
                "ozet": True,
                "gelecek_odev": False,
                "kapanis": True,
            },
            "highlight_moments": [
                {
                    "timestamp_sec": 30,
                    "description": "Strong opener",
                    "type": "engagement",
                }
            ],
            "strengths": ["Clear tone"],
            "issues": [],
        }
    )


def _merge_response_json() -> str:
    base_metric = {
        "rating": "Good",
        "observation": "(00:10) everything ok",
        "improvement_tip": "",
    }
    return "```json\n" + json.dumps(
        {
            "instructor_name": "Ali Hoca",
            "lesson_date": "2026-04-18",
            "module": 1,
            "lesson_number": 3,
            "expected_duration_min": 60,
            "actual_duration_min": 60,
            "speaking_time_rating": "satisfactory",
            "iletisim": {
                k: base_metric
                for k in [
                    "ders_dinamikleri",
                    "mod_tutum",
                    "saygi_sinirlar",
                    "tesvik_motivasyon",
                    "hatalar",
                    "acik_uclu_sorular",
                    "empati_destekleyici",
                    "etik_degerler",
                ]
            },
            "hazirlik": {
                k: base_metric
                for k in [
                    "ders_akisi_tempo",
                    "konu_bilgisi",
                    "aciklama_netligi",
                    "rasyonel_ipucu",
                ]
            },
            "organizasyon": {
                k: base_metric
                for k in [
                    "gorsel_bilesenler",
                    "konusma_ses_tonu",
                    "teknik_bilesen",
                    "zamanlama",
                ]
            },
            "ders_yapisi": [
                {"item": "Isınma", "completed": True},
                {
                    "item": "Önceki dersin gözden geçirilmesi",
                    "completed": False,
                },
                {"item": "Önceki ödevin tartışılması", "completed": False},
                {"item": "Hedefler ve beklenen sonuç", "completed": True},
                {"item": "Özet", "completed": True},
                {"item": "Gelecek ödevin tartışılması", "completed": False},
                {"item": "Kapanış", "completed": True},
            ],
            "genel_sonuc": "Beklentilere uygundu.",
            "yeterlilikler": "Good",
            "stop_faktor": 0,
            "feedback_metni": "Merhaba Hocam, ...",
        }
    ) + "\n```"


def _make_orchestrator() -> ReportOrchestrator:
    with patch("src.orchestrator.gemini_client.storage.Client"), patch(
        "src.orchestrator.gemini_client.genai.Client"
    ) as mock_client_cls:
        mock_client_cls.return_value = MagicMock()
        orch = ReportOrchestrator(
            gemini_api_key="fake-gemini",
            groq_api_key=None,
            groq_extra_api_key=None,
            buckets=_bucket_config(),
            google_cloud_project=None,
            gemini_provider="aistudio",
            provider_order=("aistudio",),
            # Two chunks from ~120s of audio so merge LLM runs (503 retry test).
            chunk_minutes=1,
        )
    return orch


def _install_bucket_router(orch: ReportOrchestrator):
    buckets = {}
    blobs = {}

    def bucket_factory(name: str):
        if name not in buckets:
            bucket_mock = MagicMock(name=f"bucket:{name}")

            def blob_factory(path: str, _bucket_name=name):
                key = (_bucket_name, path)
                if key not in blobs:
                    blobs[key] = MagicMock(name=f"blob:{_bucket_name}/{path}")
                return blobs[key]

            bucket_mock.blob.side_effect = blob_factory
            buckets[name] = bucket_mock
        return buckets[name]

    orch._storage_client = MagicMock()
    orch._storage_client.bucket.side_effect = bucket_factory
    return buckets, blobs


# --------------------------------------------------------------------------- #
#  Test 1 - happy path, correct bucket routing
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_generate_report_uses_processed_bucket_paths():
    orch = _make_orchestrator()
    buckets, blobs = _install_bucket_router(orch)

    # Prefer nested lecture_report.json first; flat JSON used when nested absent.
    nested_key = ("lectureai_processed", "results/vid-1/lecture_report.json")
    blobs[nested_key] = MagicMock()
    blobs[nested_key].exists.return_value = False

    cv_blob_key = ("lectureai_processed", "results/vid-1.json")
    blobs[cv_blob_key] = MagicMock()
    blobs[cv_blob_key].exists.return_value = True
    blobs[cv_blob_key].download_as_text = MagicMock(return_value=_cv_json())

    # Gemini responses: 1 chunk then merge
    orch._aistudio_client = MagicMock()
    orch._aistudio_client.models.generate_content.side_effect = [
        SimpleNamespace(text=_chunk_response_json()),
        SimpleNamespace(text=_chunk_response_json()),
        SimpleNamespace(text=_merge_response_json()),
    ]

    report = await orch.generate_report("vid-1", _audio_result())

    # --- Result ------------------------------------------------------- #
    assert isinstance(report, QAReport)
    assert report.video_id == "vid-1"
    assert report.instructor_name == "Ali Hoca"
    assert report.yeterlilikler == Rating.good
    assert len(report.ders_yapisi) == 7
    assert set(report.iletisim.keys()) == {
        "ders_dinamikleri",
        "mod_tutum",
        "saygi_sinirlar",
        "tesvik_motivasyon",
        "hatalar",
        "acik_uclu_sorular",
        "empati_destekleyici",
        "etik_degerler",
    }
    assert all(m.rating == Rating.good for m in report.iletisim.values())

    # --- Bucket routing ---------------------------------------------- #
    # CV was downloaded from lectureai_processed/results/vid-1.json
    blobs[cv_blob_key].download_as_text.assert_called_once()

    # Report was uploaded to lectureai_processed/reports/vid-1.json
    report_blob = blobs[("lectureai_processed", "reports/vid-1.json")]
    report_blob.upload_from_string.assert_called_once()
    uploaded = report_blob.upload_from_string.call_args.args[0]
    assert '"video_id": "vid-1"' in uploaded

    # Only the processed bucket was touched (no videos/transcripts/audio)
    assert set(buckets.keys()) == {"lectureai_processed"}

    # Two chunk windows + merge
    assert orch._aistudio_client.models.generate_content.call_count == 3


@pytest.mark.asyncio
async def test_generate_report_prefers_nested_lecture_report_over_flat_cv():
    orch = _make_orchestrator()
    _buckets, blobs = _install_bucket_router(orch)

    primary_cv_blob = ("lectureai_processed", "results/vid-1.json")
    blobs[primary_cv_blob] = MagicMock()
    blobs[primary_cv_blob].exists.return_value = True
    blobs[primary_cv_blob].download_as_text = MagicMock(return_value="{}")

    nested_cv_blob = (
        "lectureai_processed",
        "results/vid-1/lecture_report.json",
    )
    blobs[nested_cv_blob] = MagicMock()
    blobs[nested_cv_blob].exists.return_value = True
    blobs[nested_cv_blob].download_as_text = MagicMock(return_value=_cv_json())

    orch._aistudio_client = MagicMock()
    orch._aistudio_client.models.generate_content.side_effect = [
        SimpleNamespace(text=_chunk_response_json()),
        SimpleNamespace(text=_chunk_response_json()),
        SimpleNamespace(text=_merge_response_json()),
    ]

    report = await orch.generate_report("vid-1", _audio_result())

    assert report.video_id == "vid-1"
    blobs[nested_cv_blob].download_as_text.assert_called_once()
    blobs[primary_cv_blob].download_as_text.assert_not_called()


@pytest.mark.asyncio
async def test_generate_report_skips_empty_nested_json_uses_flat_cv():
    """Stub ``lecture_report.json`` must not hide a filled flat ``results/{id}.json``."""
    orch = _make_orchestrator()
    _buckets, blobs = _install_bucket_router(orch)

    nested_cv_blob = (
        "lectureai_processed",
        "results/vid-1/lecture_report.json",
    )
    blobs[nested_cv_blob] = MagicMock()
    blobs[nested_cv_blob].exists.return_value = True
    blobs[nested_cv_blob].download_as_text = MagicMock(return_value="{}")

    flat_cv_blob = ("lectureai_processed", "results/vid-1.json")
    blobs[flat_cv_blob] = MagicMock()
    blobs[flat_cv_blob].exists.return_value = True
    blobs[flat_cv_blob].download_as_text = MagicMock(return_value=_cv_json())

    orch._aistudio_client = MagicMock()
    orch._aistudio_client.models.generate_content.side_effect = [
        SimpleNamespace(text=_chunk_response_json()),
        SimpleNamespace(text=_chunk_response_json()),
        SimpleNamespace(text=_merge_response_json()),
    ]

    report = await orch.generate_report("vid-1", _audio_result())

    assert report.video_id == "vid-1"
    blobs[nested_cv_blob].download_as_text.assert_called_once()
    blobs[flat_cv_blob].download_as_text.assert_called_once()


@pytest.mark.asyncio
async def test_merge_retries_on_503_then_succeeds():
    """503 on merge is retried once (10s backoff); chunk call unchanged."""
    from google.genai.errors import ServerError

    orch = _make_orchestrator()
    _buckets, blobs = _install_bucket_router(orch)

    nested_key = ("lectureai_processed", "results/vid-1/lecture_report.json")
    blobs[nested_key] = MagicMock()
    blobs[nested_key].exists.return_value = False

    cv_blob_key = ("lectureai_processed", "results/vid-1.json")
    blobs[cv_blob_key] = MagicMock()
    blobs[cv_blob_key].exists.return_value = True
    blobs[cv_blob_key].download_as_text = MagicMock(return_value=_cv_json())

    orch._aistudio_client = MagicMock()
    orch._aistudio_client.models.generate_content.side_effect = [
        SimpleNamespace(text=_chunk_response_json()),
        SimpleNamespace(text=_chunk_response_json()),
        ServerError(
            503,
            {
                "error": {
                    "code": 503,
                    "message": "UNAVAILABLE",
                    "status": "UNAVAILABLE",
                }
            },
            None,
        ),
        SimpleNamespace(text=_merge_response_json()),
    ]

    with patch(
        "src.orchestrator.gemini_client.asyncio.sleep", new_callable=AsyncMock
    ) as mock_sleep:
        report = await orch.generate_report("vid-1", _audio_result())

    assert report.video_id == "vid-1"
    assert orch._aistudio_client.models.generate_content.call_count == 4
    slept_values = [call.args[0] for call in mock_sleep.await_args_list if call.args]
    assert 12.0 in slept_values


# --------------------------------------------------------------------------- #
#  Test 2 - _parse_gemini_json: fences + invalid JSON
# --------------------------------------------------------------------------- #
def test_parse_gemini_json_strips_fences_and_rejects_invalid():
    raw = '```json\n{"a": 1, "b": [1,2,3]}\n```'
    assert _parse_gemini_json(raw) == {"a": 1, "b": [1, 2, 3]}

    raw2 = '```\n{"x": "y"}\n```'
    assert _parse_gemini_json(raw2) == {"x": "y"}

    with pytest.raises(JSONParseError) as excinfo:
        _parse_gemini_json("not json at all {", video_id="vid-9")
    assert excinfo.value.raw_text == "not json at all {"
    assert excinfo.value.video_id == "vid-9"

    with pytest.raises(JSONParseError):
        _parse_gemini_json("[1, 2, 3]")
