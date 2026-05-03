"""Structured validation (guardrails) for LLM JSON outputs.

Workflow: parse JSON → validate schema/content → accept or retry generation.
"""

from __future__ import annotations

import os
import re
import unicodedata
from typing import Any, Dict, Mapping, MutableMapping

from src.orchestrator.report_schema import MetricResult, Rating

# Match timestamps like (00:14:18), (14:18), (1:05:30)
_TS_PATTERN = re.compile(r"\(\s*\d{1,3}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\s*\)")
_CV_VERILERINE_RE = re.compile(r"(?i)cv\s+verilerine\s+göre")


def _scrub_cv_verilerine_text(text: str) -> str:
    """Replace LLM phrasing; prefer neutral recording-focused wording."""
    if not text:
        return text
    return _CV_VERILERINE_RE.sub("Ders kaydında görüntülenemedi.", text)


def _apply_cv_verilerine_scrub(data: MutableMapping[str, Any]) -> None:
    """Mutates report/chunk JSON in place before validation."""
    fb = data.get("feedback_metni")
    if isinstance(fb, str):
        data["feedback_metni"] = _scrub_cv_verilerine_text(fb)
    for sec_name, keys in (
        ("iletisim", ILETISIM_KEYS),
        ("hazirlik", HAZIRLIK_KEYS),
        ("organizasyon", ORGANIZASYON_KEYS),
    ):
        sec = data.get(sec_name)
        if not isinstance(sec, MutableMapping):
            continue
        for key in keys:
            cell = sec.get(key)
            if not isinstance(cell, MutableMapping):
                continue
            for fld in ("observation", "improvement_tip"):
                v = cell.get(fld)
                if isinstance(v, str):
                    cell[fld] = _scrub_cv_verilerine_text(v)

_ENGLISH_MARKERS_FAKE_GUARD = {
    "good",
    "acceptable",
    "poor",
    "observation",
    "improvement",
    "teacher",
    "student",
    "classroom",
    "feedback",
}

_DEFAULT_GUARDRAIL_ATTEMPTS = 3
_ATTEMPTS_ENV_MAX = 20


def _read_attempts_env(var_name: str) -> int:
    raw = (os.environ.get(var_name) or "").strip()
    if not raw:
        return _DEFAULT_GUARDRAIL_ATTEMPTS
    try:
        v = int(raw, 10)
    except ValueError:
        return _DEFAULT_GUARDRAIL_ATTEMPTS
    return max(1, min(_ATTEMPTS_ENV_MAX, v))


ILETISIM_KEYS = [
    "ders_dinamikleri",
    "mod_tutum",
    "saygi_sinirlar",
    "tesvik_motivasyon",
    "hatalar",
    "acik_uclu_sorular",
    "empati_destekleyici",
    "etik_degerler",
]
HAZIRLIK_KEYS = [
    "ders_akisi_tempo",
    "konu_bilgisi",
    "aciklama_netligi",
    "rasyonel_ipucu",
]
ORGANIZASYON_KEYS = [
    "gorsel_bilesenler",
    "konusma_ses_tonu",
    "teknik_bilesen",
    "zamanlama",
]
DERS_YAPISI_KEYS = (
    "isinma",
    "onceki_ders_gozden",
    "onceki_odev",
    "hedefler",
    "ozet",
    "gelecek_odev",
    "kapanis",
)

_ALLOWED_GENEL_SONUC = frozenset(
    {
        "Beklentilere uygundu.",
        "Beklentilerin altında.",
        "Beklentilerin üzerinde.",
    }
)
_ALLOWED_SPEAKING_TIME = frozenset({"satisfactory", "too_much", "too_little"})

# Chunk validation: iletişim/hazırlık normally require transcript timestamps in observations,
# but these metrics are driven by CV/summary signals where (MM:SS) may be absent.
# Merge validation never requires timestamps (synthesis step).
METRICS_NO_TIMESTAMP_REQUIRED = frozenset(
    {
        "gorsel_bilesenler",
        "teknik_bilesen",
        "konusma_ses_tonu",
        "zamanlama",
    }
)


class GuardrailValidationError(ValueError):
    """LLM output failed structured validation."""


def guardrail_chunk_attempts() -> int:
    """Max chunk-analysis retries after parse/guardrail failure (env: ``GUARDRAIL_CHUNK_ATTEMPTS``)."""

    return _read_attempts_env("GUARDRAIL_CHUNK_ATTEMPTS")


def guardrail_merge_attempts() -> int:
    """Max merge-report retries after parse/guardrail failure (env: ``GUARDRAIL_MERGE_ATTEMPTS``)."""

    return _read_attempts_env("GUARDRAIL_MERGE_ATTEMPTS")


def _looks_english_heuristic(text: str) -> bool:
    tokens = [t.strip(".,:;!?()[]{}\"'").lower() for t in text.split()]
    markers = sum(1 for t in tokens if t in _ENGLISH_MARKERS_FAKE_GUARD)
    return markers >= 2


_TURKISH_RATING_EXACT: dict[str, Rating] = {
    "İyi": Rating.good,
    "Geliştirilmeli": Rating.acceptable,
    "Yetersiz": Rating.poor,
    "Değerlendirilemedi": Rating.na,
}


def _rating_string_is_na(raw: Any) -> bool:
    """True for placeholder / unknown ratings we may upgrade from."""
    if raw is None:
        return True
    s = unicodedata.normalize("NFC", str(raw).strip()).casefold()
    return s in frozenset(
        {
            "değerlendirilemedi".casefold(),
            "degerlendirilemedi",
            "n/a",
            "na",
            "none",
        }
    )


def _fix_inconsistent_ratings(metric: Dict[str, Any]) -> Dict[str, Any]:
    """
    If observation sounds positive but rating is N/A, upgrade rating.

    If observation contains positive language but rating is N/A,
    upgrade toward İyi / Geliştirilmeli based on sentiment cues.
    If observation contains no negative language and rating is N/A,
    default toward İyi when neither pole matches.
    """
    rating = metric.get("rating", "")
    observation = str(metric.get("observation", "")).lower()

    if not _rating_string_is_na(rating):
        return metric

    positive_words = [
        "olumlu",
        "iyi",
        "başarılı",
        "takdir",
        "destekleyici",
        "uygun",
        "yeterli",
        "net",
        "anlaşılır",
        "saygılı",
        "teşvik",
        "motivasyon",
        "güzel",
        "doğru",
        "etkili",
        "anlayışlı",
        "yapıcı",
        "çözüm",
        "yardımcı",
        "sabırlı",
        "profesyonel",
        "düzenli",
        "aktif",
        "dikkatli",
        "pozitif",
        "samimi",
        "açık",
        "hızlı",
        "uyumlu",
        "verimli",
    ]
    negative_words = [
        "yetersiz",
        "eksik",
        "sorun",
        "problem",
        "hata",
        "aksama",
        "kötü",
        "zayıf",
        "sınırlı",
        "az",
    ]

    positive_count = sum(1 for w in positive_words if w in observation)
    negative_count = sum(1 for w in negative_words if w in observation)

    if positive_count > 0 and negative_count == 0:
        metric["rating"] = "İyi"
    elif positive_count > 0 and negative_count > 0:
        metric["rating"] = "Geliştirilmeli"
    elif positive_count == 0 and negative_count == 0:
        metric["rating"] = "İyi"

    return metric


def _apply_rating_fixes_to_metric_sections(data: MutableMapping[str, Any]) -> None:
    """Mutates chunk or merge JSON metric dicts in place."""
    for sec_name, keys in (
        ("iletisim", ILETISIM_KEYS),
        ("hazirlik", HAZIRLIK_KEYS),
        ("organizasyon", ORGANIZASYON_KEYS),
    ):
        sec = data.get(sec_name)
        if not isinstance(sec, MutableMapping):
            continue
        for key in keys:
            cell = sec.get(key)
            if isinstance(cell, dict):
                _fix_inconsistent_ratings(cell)


def fix_metric_result_ratings(metric: Any) -> None:
    """Apply :func:`_fix_inconsistent_ratings` to a ``MetricResult`` model (mutates)."""
    if not isinstance(metric, MetricResult):
        return
    d: Dict[str, Any] = {
        "rating": metric.rating.value,
        "observation": metric.observation,
        "improvement_tip": metric.improvement_tip,
    }
    _fix_inconsistent_ratings(d)
    new_key = str(d.get("rating", "")).strip()
    mapped = _TURKISH_RATING_EXACT.get(new_key)
    if mapped is not None:
        metric.rating = mapped


def _strict_rating(raw: Any, *, field_path: str) -> Rating:
    if not isinstance(raw, str) or not raw.strip():
        raise GuardrailValidationError(f"{field_path}: rating must be a non-empty string")
    s = raw.strip()
    if s in _TURKISH_RATING_EXACT:
        return _TURKISH_RATING_EXACT[s]
    low = s.lower()
    mapping_ascii = {
        "iyi": Rating.good,
        "good": Rating.good,
        "geliştirilmeli": Rating.acceptable,
        "gelistirilmeli": Rating.acceptable,
        "acceptable": Rating.acceptable,
        "yetersiz": Rating.poor,
        "poor": Rating.poor,
        "değerlendirilemedi": Rating.na,
        "degerlendirilemedi": Rating.na,
        "n/a": Rating.na,
        "na": Rating.na,
        "none": Rating.na,
    }
    if low in mapping_ascii:
        return mapping_ascii[low]
    raise GuardrailValidationError(
        f"{field_path}: unknown rating {raw!r} (expected İyi/Geliştirilmeli/Yetersiz/Değerlendirilemedi)"
    )


def _validate_metric_cell(
    raw: Any,
    *,
    section: str,
    key: str,
    require_evidence_timestamp: bool,
    min_obs_len: int = 28,
) -> None:
    path = f"{section}.{key}"
    if not isinstance(raw, dict):
        raise GuardrailValidationError(f"{path}: expected object, got {type(raw).__name__}")
    rating = _strict_rating(raw.get("rating"), field_path=f"{path}.rating")
    obs = raw.get("observation")
    tip = raw.get("improvement_tip")
    if not isinstance(obs, str) or len(obs.strip()) < min_obs_len:
        raise GuardrailValidationError(
            f"{path}: observation too short or missing (min {min_obs_len} chars)"
        )
    if _looks_english_heuristic(obs):
        raise GuardrailValidationError(f"{path}: observation appears to be English-heavy")
    if not isinstance(tip, str):
        raise GuardrailValidationError(f"{path}: improvement_tip must be a string")

    if rating != Rating.good:
        if require_evidence_timestamp and rating != Rating.na:
            if not _TS_PATTERN.search(obs):
                raise GuardrailValidationError(
                    f"{path}: observation must include a timestamp like (MM:SS) or (HH:MM:SS)"
                )
        if rating in (Rating.acceptable, Rating.poor) and len(tip.strip()) < 12:
            raise GuardrailValidationError(
                f"{path}: improvement_tip required for non-İyi ratings"
            )
        if tip.strip() and _looks_english_heuristic(tip):
            raise GuardrailValidationError(f"{path}: improvement_tip appears English-heavy")
    elif tip.strip():
        # İyi → tip should be empty per contract
        raise GuardrailValidationError(f"{path}: improvement_tip must be empty when rating is İyi")


def _chunk_metric_requires_evidence_timestamp(section_name: str, key: str) -> bool:
    if key in METRICS_NO_TIMESTAMP_REQUIRED:
        return False
    return section_name in ("iletisim", "hazirlik")


def _validate_metric_section(
    section_name: str,
    raw: Any,
    keys: list[str],
    *,
    merge_phase: bool,
) -> None:
    if not isinstance(raw, Mapping):
        raise GuardrailValidationError(f"{section_name}: expected object, got {type(raw).__name__}")
    for key in keys:
        if key not in raw:
            raise GuardrailValidationError(f"{section_name}: missing key {key!r}")
        need_ts = False if merge_phase else _chunk_metric_requires_evidence_timestamp(
            section_name, key
        )
        _validate_metric_cell(
            raw[key],
            section=section_name,
            key=key,
            require_evidence_timestamp=need_ts,
        )


def validate_chunk_analysis_dict(data: Mapping[str, Any]) -> None:
    """Reject chunk JSON that would produce useless or invalid PDF rows."""
    if isinstance(data, dict):
        _apply_cv_verilerine_scrub(data)
    for sec_name, keys in (
        ("iletisim", ILETISIM_KEYS),
        ("hazirlik", HAZIRLIK_KEYS),
        ("organizasyon", ORGANIZASYON_KEYS),
    ):
        _validate_metric_section(
            sec_name,
            data.get(sec_name),
            keys,
            merge_phase=False,
        )

    dy = data.get("ders_yapisi")
    if not isinstance(dy, Mapping):
        raise GuardrailValidationError("ders_yapisi: expected object")
    for key in DERS_YAPISI_KEYS:
        if key not in dy:
            raise GuardrailValidationError(f"ders_yapisi: missing key {key!r}")
        if not isinstance(dy[key], bool):
            raise GuardrailValidationError(f"ders_yapisi.{key}: expected boolean")

    if isinstance(data, dict):
        _apply_rating_fixes_to_metric_sections(data)


def validate_merge_report_dict(data: Mapping[str, Any], *, duration_min: int) -> None:
    """Validate final merged QA JSON before persistence."""
    if isinstance(data, dict):
        _apply_cv_verilerine_scrub(data)
    exp = int(data.get("expected_duration_min") or 0)
    act = int(data.get("actual_duration_min") or 0)
    if exp > 0 and duration_min > 0:
        slack = max(20, duration_min * 3)
        if abs(exp - duration_min) > slack:
            raise GuardrailValidationError(
                f"expected_duration_min {exp} inconsistent with pipeline duration_min {duration_min}"
            )
    if act > 0 and duration_min > 0:
        slack = max(20, duration_min * 3)
        if abs(act - duration_min) > slack:
            raise GuardrailValidationError(
                f"actual_duration_min {act} inconsistent with pipeline duration_min {duration_min}"
            )

    str_val = data.get("speaking_time_rating")
    if not isinstance(str_val, str) or str_val.strip() not in _ALLOWED_SPEAKING_TIME:
        raise GuardrailValidationError(
            "speaking_time_rating must be one of satisfactory|too_much|too_little"
        )

    gs = data.get("genel_sonuc")
    if not isinstance(gs, str) or gs.strip() not in _ALLOWED_GENEL_SONUC:
        raise GuardrailValidationError("genel_sonuc must be one of the three allowed Turkish strings")

    fb = data.get("feedback_metni")
    if not isinstance(fb, str) or len(fb.strip()) < 120:
        raise GuardrailValidationError("feedback_metni too short")
    fb_cf = unicodedata.normalize("NFC", fb.strip()).casefold()
    if not fb_cf.startswith("merhaba hocam".casefold()):
        raise GuardrailValidationError('feedback_metni must start with "Merhaba Hocam"')
    if _looks_english_heuristic(fb):
        raise GuardrailValidationError("feedback_metni appears English-heavy")

    wc = len(fb.split())
    if wc < 35:
        raise GuardrailValidationError(f"feedback_metni word count too low ({wc}; min 35)")

    try:
        sfi = int(data["stop_faktor"])
    except (KeyError, TypeError, ValueError) as exc:
        raise GuardrailValidationError("stop_faktor must be a non-negative int") from exc
    if sfi < 0:
        raise GuardrailValidationError("stop_faktor must be a non-negative int")

    y = data.get("yeterlilikler")
    _strict_rating(y, field_path="yeterlilikler")

    # Merge step aggregates chunk analyses; observations are synthesized summaries —
    # never require transcript timestamps here (chunk stage still enforces them where needed).
    for sec_name, keys in (
        ("iletisim", ILETISIM_KEYS),
        ("hazirlik", HAZIRLIK_KEYS),
        ("organizasyon", ORGANIZASYON_KEYS),
    ):
        _validate_metric_section(
            sec_name,
            data.get(sec_name),
            keys,
            merge_phase=True,
        )

    dy_raw = data.get("ders_yapisi")
    if isinstance(dy_raw, list):
        if len(dy_raw) < 7:
            raise GuardrailValidationError("ders_yapisi list too short")
        for i, entry in enumerate(dy_raw):
            if not isinstance(entry, Mapping):
                raise GuardrailValidationError(f"ders_yapisi[{i}]: expected object")
            if "completed" not in entry:
                raise GuardrailValidationError(f"ders_yapisi[{i}]: missing completed")
            if not isinstance(entry["completed"], bool):
                raise GuardrailValidationError(f"ders_yapisi[{i}].completed: expected boolean")
    elif isinstance(dy_raw, Mapping):
        for key in DERS_YAPISI_KEYS:
            if key not in dy_raw:
                raise GuardrailValidationError(f"ders_yapisi: missing key {key!r}")
            if not isinstance(dy_raw[key], bool):
                raise GuardrailValidationError(f"ders_yapisi.{key}: expected boolean")
    else:
        raise GuardrailValidationError("ders_yapisi: expected array or object")

    if isinstance(data, dict):
        _apply_rating_fixes_to_metric_sections(data)
