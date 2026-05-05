"""Independent QA report quality evaluator via OpenRouter (separate model from generator)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class CritiqueResult(BaseModel):
    total_score: int
    passed: bool
    dimension_scores: Dict[str, int] = Field(default_factory=dict)
    issues: List[str] = Field(default_factory=list)
    retry_reason: Optional[str] = None


class QualityAgent:
    """
    Independent quality evaluator using a different LLM via OpenRouter to avoid
    self-assessment bias. Report generation may use Gemini/OpenRouter flash;
    this agent defaults to Llama 3.3 70B instruct.
    """

    PASS_THRESHOLD = 70
    QUALITY_MODEL = "meta-llama/llama-3.3-70b-instruct"

    def __init__(self, api_key: str, model: str | None = None) -> None:
        self.api_key = api_key
        self.model = model or self.QUALITY_MODEL

    async def evaluate(self, report_dict: dict, video_id: str) -> CritiqueResult:
        if self._report_indicates_llm_quota(report_dict):
            logger.warning(
                "[%s] QualityAgent detected quota-degraded report content; forcing retry",
                video_id,
            )
            return CritiqueResult(
                total_score=0,
                passed=False,
                dimension_scores={},
                issues=[
                    "LLM quota/rate-limit fallback metni tespit edildi; rapor yeniden denenmeli."
                ],
                retry_reason="llm_quota_reached",
            )
        prompt = self._build_prompt(report_dict)

        try:
            response = await asyncio.to_thread(self._call_openrouter, prompt)

            raw = response.strip()
            if raw.startswith("```"):
                parts = raw.split("```")
                if len(parts) >= 2:
                    raw = parts[1]
                    if raw.lstrip().startswith("json"):
                        raw = raw.lstrip()[4:]
            raw = raw.strip()

            result = json.loads(raw)
            scores = result.get("scores") or {}
            if not isinstance(scores, dict):
                scores = {}
            total = sum(int(v) for v in scores.values() if isinstance(v, (int, float)))
            passed = total >= self.PASS_THRESHOLD

            issues: List[str] = []
            feedback = result.get("feedback") or {}
            if not isinstance(feedback, dict):
                feedback = {}
            for dim, score in scores.items():
                try:
                    sc = int(score)
                except (TypeError, ValueError):
                    continue
                if sc < 14:
                    issues.append(
                        f"{dim} ({sc}/20): "
                        f"{feedback.get(dim, 'yetersiz')}"
                    )

            logger.info(
                "[%s] QualityAgent score=%d/100 passed=%s model=%s",
                video_id,
                total,
                passed,
                self.model,
            )

            rr = result.get("retry_reason")
            retry_reason = str(rr) if rr not in (None, "", "null") else None

            return CritiqueResult(
                total_score=total,
                passed=passed,
                dimension_scores={k: int(v) for k, v in scores.items() if isinstance(v, (int, float))},
                issues=issues,
                retry_reason=retry_reason,
            )

        except Exception as e:
            retry_reason: Optional[str] = None
            if isinstance(e, httpx.HTTPStatusError):
                code = e.response.status_code
                if code in (402, 429, 503):
                    retry_reason = f"http_{code}_quota_or_capacity"
            logger.warning(
                "[%s] QualityAgent failed (%s), marking as failed for retry",
                video_id,
                e,
            )
            return CritiqueResult(
                total_score=0,
                passed=False,
                dimension_scores={},
                issues=[f"quality_agent_error: {e}"],
                retry_reason=retry_reason or "quality_agent_unavailable",
            )

    @staticmethod
    def _report_indicates_llm_quota(report: dict) -> bool:
        if not isinstance(report, dict):
            return False
        fb = str(report.get("feedback_metni") or "").lower()
        markers = (
            "ai analizi bekleniyor (kota dolu)",
            "kota dolu",
            "llm katmanı kota aşımı",
            "tüm llm sağlayıcıları başarısız",
            "yedek teknik özet",
        )
        return any(m in fb for m in markers)

    def _call_openrouter(self, prompt: str) -> str:
        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "HTTP-Referer": "https://lectureai.app",
                "X-Title": "LectureAI-QualityAgent",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Sen bir eğitim kalite uzmanısın. "
                            "Verilen QA raporunu değerlendir. "
                            "SADECE geçerli JSON döndür. "
                            "Markdown, açıklama veya başka hiçbir şey ekleme."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 800,
                "temperature": 0.1,
            },
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    def _build_prompt(self, report: dict) -> str:
        feedback = report.get("feedback_metni", "")
        ders_yapisi = report.get("ders_yapisi", [])
        if not isinstance(ders_yapisi, list):
            ders_yapisi = []
        completed = sum(
            1
            for d in ders_yapisi
            if isinstance(d, dict) and d.get("completed")
        )
        total_items = len(ders_yapisi)

        sample_obs: List[str] = []
        for section in ("iletisim", "hazirlik", "organizasyon"):
            sec = report.get(section)
            if not isinstance(sec, dict):
                continue
            for key, metric in sec.items():
                if isinstance(metric, dict):
                    rating = metric.get("rating", "")
                    obs = str(metric.get("observation", ""))[:120]
                    sample_obs.append(f"  {key} [{rating}]: {obs}")

        ts_count = len(
            re.findall(r"\d{2}:\d{2}:\d{2}|\d{2}:\d{2}", feedback)
        )

        english_words = (
            "the ",
            "is ",
            "are ",
            "was ",
            "instructor ",
            "student ",
        )
        fb_low = feedback.lower()
        has_english = any(w in fb_low for w in english_words)

        return f"""Bu QA raporunu 5 kritere göre değerlendir (her biri 0-20 puan):

RAPOR ÖZETİ:
- Feedback uzunluğu: {len(feedback.split())} kelime (minimum 150 beklenir)
- Feedback'teki timestamp sayısı: {ts_count} (minimum 3 beklenir)
- İngilizce kelime var mı: {"Evet (sorun!)" if has_english else "Hayır (iyi)"}
- Ders yapısı: {completed}/{total_items} tamamlandı

ÖRNEK GÖZLEMLER:
{chr(10).join(sample_obs[:6])}

FEEDBACK METNİ (ilk 400 karakter):
{feedback[:400]}

KRİTERLER:
1. somutluk (0-20): Her gözlemde timestamp var mı? Derse özgü somut kanıt var mı?
   20=her gözlemde timestamp+somut, 10=bazılarında var, 0=yok
2. turkce_kalitesi (0-20): Dil tamamen Türkçe ve akıcı mı?
   20=mükemmel Türkçe, 10=birkaç sorun, 0=İngilizce karışmış
3. rating_tutarliligi (0-20): Rating ile gözlem içeriği uyuşuyor mu?
   20=tam uyumlu, 10=çoğu uyumlu, 0=çelişkili
4. feedback_kalitesi (0-20): Feedback 150+ kelime, 3+ timestamp, dengeli mi?
   20=mükemmel, 10=kısmen, 0=şablon/kısa
5. ders_yapisi_mantigi (0-20): Ders yapısı tespiti makul mü?
   20=mantıklı, 10=kısmen, 0=hepsi true veya hepsi false

SADECE bu JSON formatında döndür:
{{
  "scores": {{
    "somutluk": <int>,
    "turkce_kalitesi": <int>,
    "rating_tutarliligi": <int>,
    "feedback_kalitesi": <int>,
    "ders_yapisi_mantigi": <int>
  }},
  "feedback": {{
    "somutluk": "<kısa açıklama>",
    "turkce_kalitesi": "<kısa açıklama>",
    "rating_tutarliligi": "<kısa açıklama>",
    "feedback_kalitesi": "<kısa açıklama>",
    "ders_yapisi_mantigi": "<kısa açıklama>"
  }},
  "retry_reason": "<varsa neden retry gerekiyor, yoksa null>"
}}"""
