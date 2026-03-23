"""Planner explanation generator.

Produces concise, user-facing plan rationale. Uses AI when enabled and available,
with deterministic fallback text.
"""

import asyncio
import json
import logging
import re

from shared.ai import run_prompt_via_graph
from shared.config import get_settings
from shared.models import PlannerQualityScore, PlannerAIRecommendation

logger = logging.getLogger(__name__)


def fallback_explanation(
    *,
    goal_title: str,
    quality: PlannerQualityScore,
    disruption_index: float,
    used_fallback: bool,
) -> str:
    status = "used safe fallback defaults" if used_fallback else "used calibrated planner settings"
    warning = f" Warnings: {'; '.join(quality.warnings)}." if quality.warnings else ""
    return (
        f"Global replan for '{goal_title}' {status}. "
        f"Quality score: {quality.overall_score:.1f}/100. "
        f"Disruption index: {disruption_index:.3f}."
        f"{warning}"
    )


async def generate_plan_explanation(
    *,
    goal_title: str,
    quality: PlannerQualityScore,
    disruption_index: float,
    ai_recommendation: PlannerAIRecommendation,
    used_fallback: bool,
) -> str:
    settings = get_settings()
    if not settings.planner_ai_explanations_enabled:
        return fallback_explanation(
            goal_title=goal_title,
            quality=quality,
            disruption_index=disruption_index,
            used_fallback=used_fallback,
        )

    payload = {
        "goal_title": goal_title,
        "quality": quality.model_dump(mode="json"),
        "disruption_index": disruption_index,
        "ai_recommendation": ai_recommendation.model_dump(mode="json"),
        "used_fallback": used_fallback,
    }

    prompt = (
        "Write a short planner explanation for users in 2-3 sentences. "
        "Mention tradeoffs and any risks. No markdown.\n"
        f"Context JSON: {json.dumps(payload, ensure_ascii=True)}"
    )

    try:
        text = await asyncio.wait_for(
            asyncio.to_thread(
                run_prompt_via_graph,
                prompt,
                temperature=0.1,
                json_mode=False,
                model=settings.planner_ai_model,
            ),
            timeout=max(1, int(settings.planner_ai_timeout_ms / 1000)),
        )
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            raise ValueError("Empty explanation")
        return text
    except Exception:
        logger.warning("Planner explanation generation failed; using fallback", exc_info=True)
        return fallback_explanation(
            goal_title=goal_title,
            quality=quality,
            disruption_index=disruption_index,
            used_fallback=used_fallback,
        )
