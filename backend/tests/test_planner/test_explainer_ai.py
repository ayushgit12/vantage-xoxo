from agents.planner.explainer_ai import fallback_explanation
from shared.models import PlannerQualityScore, PlannerAIRecommendation


def test_fallback_explanation_contains_quality_and_disruption():
    quality = PlannerQualityScore(
        overall_score=72.5,
        feasibility_score=90,
        load_balance_score=65,
        fragmentation_score=70,
        deadline_risk_score=60,
        warnings=["Daily load is uneven"],
    )

    text = fallback_explanation(
        goal_title="Learn ML",
        quality=quality,
        disruption_index=0.123,
        used_fallback=True,
    )

    assert "Learn ML" in text
    assert "72.5" in text
    assert "0.123" in text
    assert "fallback" in text.lower()
