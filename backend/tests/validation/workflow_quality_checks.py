"""Quality and preflight checks for live workflow validation tests."""

from __future__ import annotations

from typing import Any

from shared.config import get_settings


def ensure_live_runtime_config() -> None:
    """Fail fast when required live runtime config is missing."""
    settings = get_settings()

    missing: list[str] = []
    if not (settings.cosmos_connection_string or "").strip():
        missing.append("COSMOS_CONNECTION_STRING")

    has_llm_key = bool((settings.azure_openai_api_key or settings.llm_api_key or "").strip())
    if not has_llm_key:
        missing.append("AZURE_OPENAI_API_KEY or LLM_API_KEY")

    if missing:
        raise AssertionError(
            "Live validation requires runtime config. Missing: " + ", ".join(missing)
        )


def assert_knowledge_quality(knowledge: dict[str, Any], *, min_topics: int = 2) -> None:
    topics = knowledge.get("topics", [])
    assert isinstance(topics, list), "knowledge.topics must be a list"
    assert len(topics) >= min_topics, f"expected at least {min_topics} topics"

    est_total = float(knowledge.get("estimated_total_hours", 0.0) or 0.0)
    assert est_total > 0.0, "estimated_total_hours must be > 0"

    for t in topics:
        title = str(t.get("title", "")).strip()
        assert title, "topic title must be non-empty"
        est_hours = float(t.get("est_hours", 0.0) or 0.0)
        assert est_hours > 0.0, "topic est_hours must be > 0"


def assert_plan_quality(plan_generate_payload: dict[str, Any]) -> None:
    assert plan_generate_payload.get("status") == "completed"
    assert plan_generate_payload.get("blocks", 0) >= 1

    # Planner AI metadata fields should be present in generate response.
    assert "quality_score" in plan_generate_payload
    assert "disruption_index" in plan_generate_payload
    assert "used_fallback" in plan_generate_payload
    assert "retry_triggered" in plan_generate_payload


def assert_telemetry_quality(stats: dict[str, Any], *, min_plans: int) -> None:
    assert int(stats.get("total_plans", 0)) >= min_plans
    assert int(stats.get("total_blocks", 0)) >= min_plans

    assert "avg_quality_score" in stats
    assert "avg_disruption_index" in stats
    assert "avg_ai_confidence" in stats
    assert "used_fallback_count" in stats
    assert "retry_triggered_count" in stats


def assert_ryuk_response_quality(text: str, *, expected_keywords: list[str]) -> None:
    msg = text.strip()
    assert msg, "Ryuk response must be non-empty"
    assert len(msg) >= 20, "Ryuk response is too short"

    lowered = msg.lower()
    if not any(k.lower() in lowered for k in expected_keywords):
        raise AssertionError(
            "Ryuk response did not include expected context keywords: "
            + ", ".join(expected_keywords)
        )
