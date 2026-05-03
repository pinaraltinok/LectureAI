"""Tests for ``src.orchestrator.report_guardrails``."""

from __future__ import annotations

from src.orchestrator.report_guardrails import fix_metric_result_ratings
from src.orchestrator.report_schema import MetricResult, Rating


def _long_obs(*, phrase: str) -> str:
    return (
        f"(10:00) Görsel bileşenler açısından {phrase} "
        + "x" * 40
    )


def test_gorsel_bilesenler_downgrades_iyi_when_goruntulenemedi() -> None:
    m = MetricResult(
        rating=Rating.good,
        observation=_long_obs(phrase="görüntülenemedi"),
        improvement_tip="",
    )
    fix_metric_result_ratings(m, metric_key="gorsel_bilesenler")
    assert m.rating == Rating.acceptable


def test_gorsel_bilesenler_downgrades_na_when_tespit_edilemedi() -> None:
    m = MetricResult(
        rating=Rating.na,
        observation=_long_obs(phrase="tespit edilemedi"),
        improvement_tip="Öneri metni burada yeterince uzun olmalıdır.",
    )
    fix_metric_result_ratings(m, metric_key="gorsel_bilesenler")
    assert m.rating == Rating.acceptable


def test_gorsel_bilesenler_leaves_yetersiz() -> None:
    m = MetricResult(
        rating=Rating.poor,
        observation=_long_obs(phrase="görüntülenemedi"),
        improvement_tip="Öneri metni burada yeterince uzun olmalıdır.",
    )
    fix_metric_result_ratings(m, metric_key="gorsel_bilesenler")
    assert m.rating == Rating.poor


def test_gorsel_phrase_without_key_does_not_change_iyi() -> None:
    m = MetricResult(
        rating=Rating.good,
        observation=_long_obs(phrase="görüntülenemedi"),
        improvement_tip="",
    )
    fix_metric_result_ratings(m, metric_key="saygi_sinirlar")
    assert m.rating == Rating.good


def test_teknik_bilesen_forces_iyi_when_no_issue_phrase() -> None:
    obs = (
        "(05:00) Ders boyunca herhangi bir teknik sorun yaşanmadı; "
        "ses ve görüntü akışı sorunsuzdu. " + "x" * 20
    )
    m = MetricResult(
        rating=Rating.na,
        observation=obs,
        improvement_tip="",
    )
    fix_metric_result_ratings(m, metric_key="teknik_bilesen")
    assert m.rating == Rating.good


def test_hatalar_forces_iyi_when_positive_phrase() -> None:
    obs = (
        "(12:00) Öğrenci hatalarına karşı yapıcı bir yaklaşım sergilendi; "
        "motivasyonunu düşürmemeye özen gösterildi. " + "x" * 10
    )
    m = MetricResult(
        rating=Rating.na,
        observation=obs,
        improvement_tip="",
    )
    fix_metric_result_ratings(m, metric_key="hatalar")
    assert m.rating == Rating.good
