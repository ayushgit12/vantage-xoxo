from agents.planner.ai_advisor import (
    build_planner_ai_input,
    fallback_recommendation,
    validate_and_clamp_recommendation,
)


def test_build_planner_ai_input_defaults_shape():
    payload = build_planner_ai_input(
        user_id="u1",
        window_days=7,
        active_goals_count=3,
        active_topics_count=12,
        recent_done_ratio=0.5,
        recent_partial_ratio=0.2,
        recent_missed_ratio=0.3,
    )

    assert payload.user_id == "u1"
    assert payload.window_days == 7
    assert payload.active_goals_count == 3
    assert payload.active_topics_count == 12


def test_validate_and_clamp_recommendation_clamps_bounds():
    rec = validate_and_clamp_recommendation(
        {
            "confidence": 1.0,
            "daily_capacity_multiplier": 2.0,
            "max_topics_per_day_override": 99,
            "preferred_block_minutes": 53,
            "max_disruption_budget": 9,
            "urgency_boost_per_goal": {"g1": 9, "g2": -9, "g3": "x"},
            "notes": "test",
        }
    )

    assert rec.daily_capacity_multiplier == 1.2
    assert rec.max_topics_per_day_override == 6
    assert rec.preferred_block_minutes in {45, 60}
    assert rec.max_disruption_budget == 0.5
    assert rec.urgency_boost_per_goal["g1"] == 0.5
    assert rec.urgency_boost_per_goal["g2"] == -0.5
    assert "g3" not in rec.urgency_boost_per_goal


def test_fallback_recommendation_has_reason_note():
    rec, reason = fallback_recommendation("AI_TIMEOUT")

    assert reason == "AI_TIMEOUT"
    assert rec.confidence == 0.0
    assert rec.daily_capacity_multiplier == 1.0
    assert "AI_TIMEOUT" in rec.notes
