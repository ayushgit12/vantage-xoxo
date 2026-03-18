"""Structured topic time estimation using LLM plus code-side validation.

The model decides scope/difficulty/type/hours for each topic.
Python validates shape, enforces sane ranges, and normalizes obvious inconsistencies.
There is no heuristic fallback path in this estimator.
"""

import json
import logging
import re
from typing import Any

from shared.ai import run_prompt_via_graph

from shared.cache.cache import get_cached, set_cached
from shared.config import get_settings

logger = logging.getLogger(__name__)

MIN_HOURS_PER_TOPIC = 0.5
MAX_HOURS_PER_TOPIC = 40.0
TOPIC_TYPE_FLOORS = {
    "concept": 1.0,
    "practice": 1.5,
    "project": 3.0,
}
SCOPE_FLOORS = {
    "narrow": 0.5,
    "medium": 1.5,
    "broad": 4.0,
}
DIFFICULTY_FLOORS = {
    "beginner": 0.5,
    "intermediate": 1.5,
    "advanced": 3.0,
}

ESTIMATION_PROMPT = """You are an expert learning architect.

Given a set of extracted learning topics and a short summary of the source material, estimate realistic study effort per topic.

Requirements:
- Return one estimate entry for every input topic title.
- Consider topic breadth, conceptual difficulty, prerequisite depth, and project/practice load.
- If material coverage for a topic is thin but the topic itself is broad, DO NOT underestimate it.
- Use these enums only:
  - difficulty: "beginner" | "intermediate" | "advanced"
  - scope: "narrow" | "medium" | "broad"
  - topic_type: "concept" | "practice" | "project"
- estimated_hours must be realistic study time in hours.
- min_hours <= estimated_hours <= max_hours.
- confidence must be between 0.0 and 1.0.

Return strict JSON only:
{{
    "topics": [
        {{
            "title": "...",
            "estimated_hours": 8.0,
            "min_hours": 5.0,
            "max_hours": 12.0,
            "difficulty": "intermediate",
            "scope": "broad",
            "topic_type": "concept",
            "confidence": 0.72,
            "reasoning": "short explanation"
        }}
    ]
}}

Source material summary:
- total_characters: {total_chars}
- approx_pages: {approx_pages}
- approx_video_mentions: {video_mentions}
- sample_excerpt: {sample_excerpt}

Topics to estimate:
{topics_json}
"""


def _normalize_enum(value: Any, allowed: set[str], field_name: str) -> str:
    candidate = str(value).strip().lower()
    if candidate not in allowed:
        raise ValueError(f"Estimator field '{field_name}' must be one of {sorted(allowed)}")
    return candidate


def _normalize_hours(value: Any, field_name: str) -> float:
    try:
        hours = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Estimator field '{field_name}' must be numeric") from exc
    return round(max(MIN_HOURS_PER_TOPIC, min(hours, MAX_HOURS_PER_TOPIC)), 1)


def _normalize_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Estimator field 'confidence' must be numeric") from exc
    return round(max(0.0, min(confidence, 1.0)), 2)


def _material_summary(raw_texts: list[str]) -> dict[str, Any]:
    combined = "\n".join(raw_texts)
    total_chars = len(combined)
    approx_pages = max(total_chars // 3000, 1) if total_chars else 0
    video_mentions = len(re.findall(r"youtube|video|watch|lecture|recording", combined.lower()))
    sample_excerpt = combined[:1200].replace("\n", " ").strip()
    return {
        "total_chars": total_chars,
        "approx_pages": approx_pages,
        "video_mentions": video_mentions,
        "sample_excerpt": sample_excerpt or "No source text provided",
    }


def _guardrailed_hours(topic_estimate: dict[str, Any]) -> tuple[float, float, float]:
    estimated = _normalize_hours(topic_estimate.get("estimated_hours"), "estimated_hours")
    min_hours = _normalize_hours(topic_estimate.get("min_hours"), "min_hours")
    max_hours = _normalize_hours(topic_estimate.get("max_hours"), "max_hours")

    difficulty = _normalize_enum(
        topic_estimate.get("difficulty"),
        {"beginner", "intermediate", "advanced"},
        "difficulty",
    )
    scope = _normalize_enum(
        topic_estimate.get("scope"),
        {"narrow", "medium", "broad"},
        "scope",
    )
    topic_type = _normalize_enum(
        topic_estimate.get("topic_type"),
        {"concept", "practice", "project"},
        "topic_type",
    )

    floor = max(
        TOPIC_TYPE_FLOORS[topic_type],
        SCOPE_FLOORS[scope],
        DIFFICULTY_FLOORS[difficulty],
    )

    estimated = max(estimated, floor)
    min_hours = max(min_hours, min(floor, estimated))
    max_hours = max(max_hours, estimated)

    if min_hours > estimated:
        min_hours = estimated
    if estimated > max_hours:
        max_hours = estimated

    return round(min_hours, 1), round(estimated, 1), round(max_hours, 1)


async def estimate_hours(
    topics: list[dict],
    raw_texts: list[str],
) -> list[dict]:
    """Estimate hours for topics via structured LLM output with strict validation."""
    if not topics:
        return topics

    settings = get_settings()
    active_key = settings.llm_api_key or settings.azure_openai_api_key
    if not active_key or active_key == "your-llm-api-key-here":
        raise ValueError("LLM API key not configured for topic estimation")

    summary = _material_summary(raw_texts)
    prompt_topics = [
        {
            "title": topic.get("title", ""),
            "description": topic.get("description", ""),
            "prereq_titles": topic.get("prereq_titles", []),
        }
        for topic in topics
    ]
    cache_key = {
        "op": "estimate_topic_hours",
        "topics": prompt_topics,
        "summary": {
            "total_chars": summary["total_chars"],
            "approx_pages": summary["approx_pages"],
            "video_mentions": summary["video_mentions"],
        },
    }

    cached = await get_cached(cache_key)
    if cached:
        logger.info("Using cached structured hour estimates for %d topics", len(topics))
        result = cached
    else:
        prompt = ESTIMATION_PROMPT.format(
            total_chars=summary["total_chars"],
            approx_pages=summary["approx_pages"],
            video_mentions=summary["video_mentions"],
            sample_excerpt=json.dumps(summary["sample_excerpt"]),
            topics_json=json.dumps(prompt_topics, ensure_ascii=True),
        )

        logger.info("[ESTIMATOR] Requesting structured estimates for %d topics", len(topics))
        try:
            result_text = run_prompt_via_graph(
                prompt,
                temperature=0.0,
                json_mode=True,
            )
        except Exception as exc:
            logger.error("[ESTIMATOR] LLM estimation call failed: %s", exc, exc_info=True)
            raise ValueError("Topic estimation model call failed") from exc

        result_text = result_text.strip()
        result_text = re.sub(r"^```(?:json)?\s*\n?", "", result_text)
        result_text = re.sub(r"\n?```\s*$", "", result_text)
        result_text = result_text.strip()

        logger.info("[ESTIMATOR] Raw model response: %s", result_text[:500])
        try:
            result = json.loads(result_text)
        except json.JSONDecodeError as exc:
            logger.error("[ESTIMATOR] Invalid JSON from estimator model: %s", result_text[:800])
            raise ValueError(f"Estimator returned invalid JSON: {exc}") from exc

        await set_cached(cache_key, result)

    model_topics = result.get("topics")
    if not isinstance(model_topics, list):
        raise ValueError("Estimator response missing 'topics' list")

    model_by_title: dict[str, dict[str, Any]] = {}
    for item in model_topics:
        if not isinstance(item, dict):
            raise ValueError("Estimator topic entries must be objects")
        title = str(item.get("title", "")).strip()
        if not title:
            raise ValueError("Estimator topic entry missing title")
        model_by_title[title] = item

    enriched_topics: list[dict] = []
    missing_titles: list[str] = []
    for topic in topics:
        title = str(topic.get("title", "")).strip()
        model_topic = model_by_title.get(title)
        if model_topic is None:
            missing_titles.append(title)
            continue

        min_hours, est_hours, max_hours = _guardrailed_hours(model_topic)
        difficulty = _normalize_enum(model_topic.get("difficulty"), {"beginner", "intermediate", "advanced"}, "difficulty")
        scope = _normalize_enum(model_topic.get("scope"), {"narrow", "medium", "broad"}, "scope")
        topic_type = _normalize_enum(model_topic.get("topic_type"), {"concept", "practice", "project"}, "topic_type")
        confidence = _normalize_confidence(model_topic.get("confidence"))

        enriched_topics.append({
            **topic,
            "est_hours": est_hours,
            "est_hours_min": min_hours,
            "est_hours_max": max_hours,
            "difficulty": difficulty,
            "scope": scope,
            "topic_type": topic_type,
            "estimation_confidence": confidence,
            "estimation_reasoning": str(model_topic.get("reasoning", "")).strip(),
        })

    if missing_titles:
        raise ValueError(f"Estimator response missing topics: {missing_titles}")

    logger.info(
        "Estimated hours for %d topics via structured LLM output: %.1fh total",
        len(enriched_topics),
        sum(t.get("est_hours", 0.0) for t in enriched_topics),
    )
    return enriched_topics
