"""Planner AI advisor service.

This module provides guarded AI recommendations for planner tuning.
The deterministic planner remains the final scheduling authority.
"""

import asyncio
import json
import logging
import re
from typing import Any

from shared.ai import run_prompt_via_graph
from shared.cache.cache import get_cached, set_cached
from shared.config import get_settings
from shared.models import PlannerAIInput, PlannerAIRecommendation, PlannerAIFallbackReason

logger = logging.getLogger(__name__)

_ALLOWED_BLOCK_MINUTES = {30, 45, 60, 90}

_PROMPT = """You are a planning quality advisor for a deterministic scheduler.
Return strict JSON only with these fields:
{
  "confidence": 0.0,
  "daily_capacity_multiplier": 1.0,
  "max_topics_per_day_override": null,
  "preferred_block_minutes": null,
  "max_disruption_budget": 0.25,
  "urgency_boost_per_goal": {},
  "notes": ""
}

Rules:
- confidence in [0,1]
- daily_capacity_multiplier in [0.5,1.2]
- max_topics_per_day_override null or integer in [1,6]
- preferred_block_minutes null or one of [30,45,60,90]
- max_disruption_budget in [0,0.5]
- urgency_boost_per_goal values between [-0.5, 0.5]

Context JSON:
{context_json}
"""


def build_planner_ai_input(
    *,
    user_id: str,
    window_days: int,
    active_goals_count: int,
    active_topics_count: int,
    recent_done_ratio: float,
    recent_partial_ratio: float,
    recent_missed_ratio: float,
    day_capacity_profile: dict[str, float] | None = None,
    topic_overrun_factors: dict[str, float] | None = None,
) -> PlannerAIInput:
    return PlannerAIInput(
        user_id=user_id,
        window_days=window_days,
        active_goals_count=active_goals_count,
        active_topics_count=active_topics_count,
        recent_done_ratio=recent_done_ratio,
        recent_partial_ratio=recent_partial_ratio,
        recent_missed_ratio=recent_missed_ratio,
        day_capacity_profile=day_capacity_profile or {},
        topic_overrun_factors=topic_overrun_factors or {},
    )


def fallback_recommendation(
    reason: PlannerAIFallbackReason,
) -> tuple[PlannerAIRecommendation, PlannerAIFallbackReason]:
    rec = PlannerAIRecommendation(
        confidence=0.0,
        daily_capacity_multiplier=1.0,
        max_topics_per_day_override=None,
        preferred_block_minutes=None,
        max_disruption_budget=0.25,
        urgency_boost_per_goal={},
        notes=f"Fallback recommendation used: {reason}",
    )
    return rec, reason


def validate_and_clamp_recommendation(
    raw: dict[str, Any],
) -> PlannerAIRecommendation:
    safe_raw: dict[str, Any] = dict(raw)

    def _to_float(value: Any, default: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def _to_int(value: Any, default: int | None) -> int | None:
        if value is None:
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    safe_raw["confidence"] = _to_float(safe_raw.get("confidence", 0.0), 0.0)
    safe_raw["daily_capacity_multiplier"] = _to_float(
        safe_raw.get("daily_capacity_multiplier", 1.0), 1.0
    )
    safe_raw["max_topics_per_day_override"] = _to_int(
        safe_raw.get("max_topics_per_day_override", None), None
    )
    safe_raw["preferred_block_minutes"] = _to_int(
        safe_raw.get("preferred_block_minutes", None), None
    )
    safe_raw["max_disruption_budget"] = _to_float(
        safe_raw.get("max_disruption_budget", 0.25), 0.25
    )

    # Pre-clamp before model construction to avoid pydantic range errors.
    safe_raw["confidence"] = max(0.0, min(1.0, safe_raw["confidence"]))
    safe_raw["daily_capacity_multiplier"] = max(
        0.5, min(1.2, safe_raw["daily_capacity_multiplier"])
    )
    if safe_raw["max_topics_per_day_override"] is not None:
        safe_raw["max_topics_per_day_override"] = max(
            1, min(6, safe_raw["max_topics_per_day_override"])
        )
    if safe_raw["preferred_block_minutes"] is not None:
        safe_raw["preferred_block_minutes"] = int(safe_raw["preferred_block_minutes"])
    safe_raw["max_disruption_budget"] = max(
        0.0, min(0.5, safe_raw["max_disruption_budget"])
    )

    raw_boosts = safe_raw.get("urgency_boost_per_goal", {})
    parsed_boosts: dict[str, float] = {}
    if isinstance(raw_boosts, dict):
        for gid, value in raw_boosts.items():
            try:
                parsed_boosts[str(gid)] = float(value)
            except (TypeError, ValueError):
                continue
    safe_raw["urgency_boost_per_goal"] = parsed_boosts

    rec = PlannerAIRecommendation(**safe_raw)

    rec.daily_capacity_multiplier = max(0.5, min(1.2, rec.daily_capacity_multiplier))

    if rec.max_topics_per_day_override is not None:
        rec.max_topics_per_day_override = max(1, min(6, int(rec.max_topics_per_day_override)))

    if rec.preferred_block_minutes is not None:
        closest = min(_ALLOWED_BLOCK_MINUTES, key=lambda m: abs(m - int(rec.preferred_block_minutes)))
        rec.preferred_block_minutes = closest

    rec.max_disruption_budget = max(0.0, min(0.5, rec.max_disruption_budget))

    clamped_boosts: dict[str, float] = {}
    for gid, value in rec.urgency_boost_per_goal.items():
        try:
            clamped_boosts[str(gid)] = max(-0.5, min(0.5, float(value)))
        except (TypeError, ValueError):
            continue
    rec.urgency_boost_per_goal = clamped_boosts

    return rec


async def get_planner_recommendation(
    planner_input: PlannerAIInput,
) -> tuple[PlannerAIRecommendation, PlannerAIFallbackReason | None]:
    settings = get_settings()

    if not settings.planner_ai_enabled:
        rec, reason = fallback_recommendation("AI_UNAVAILABLE")
        return rec, reason

    cache_key = {
        "op": "planner_ai_recommendation",
        "input": planner_input.model_dump(mode="json"),
        "model": settings.planner_ai_model,
    }

    cached = await get_cached(cache_key)
    if cached:
        try:
            return validate_and_clamp_recommendation(cached), None
        except Exception:
            logger.warning("Planner AI cache entry invalid, falling back", exc_info=True)

    prompt = _PROMPT.format(
        context_json=json.dumps(planner_input.model_dump(mode="json"), ensure_ascii=True),
    )

    try:
        result_text = await asyncio.wait_for(
            asyncio.to_thread(
                run_prompt_via_graph,
                prompt,
                temperature=0.0,
                json_mode=True,
                model=settings.planner_ai_model,
            ),
            timeout=max(1, int(settings.planner_ai_timeout_ms / 1000)),
        )
    except asyncio.TimeoutError:
        rec, reason = fallback_recommendation("AI_TIMEOUT")
        return rec, reason
    except Exception:
        logger.warning("Planner AI call failed, using fallback", exc_info=True)
        rec, reason = fallback_recommendation("AI_UNAVAILABLE")
        return rec, reason

    text = result_text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text).strip()

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        rec, reason = fallback_recommendation("AI_INVALID_OUTPUT")
        return rec, reason

    try:
        rec = validate_and_clamp_recommendation(payload)
    except Exception:
        rec, reason = fallback_recommendation("AI_INVALID_OUTPUT")
        return rec, reason

    if rec.confidence < settings.planner_ai_min_confidence:
        low_conf_rec, reason = fallback_recommendation("AI_LOW_CONFIDENCE")
        return low_conf_rec, reason

    await set_cached(cache_key, rec.model_dump(mode="json"))
    return rec, None
