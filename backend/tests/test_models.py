"""Test data models."""

import pytest

from shared.models import Goal, GoalCreate, GoalKnowledge, Topic, UserProfile, Plan
from shared.models.goal import GoalStatus
from shared.models.user import TimeWindow


def test_goal_creation():
    goal = Goal(
        user_id="u1",
        title="Learn Rust",
        deadline="2026-06-01T00:00:00",
    )
    assert goal.goal_id
    assert goal.user_id == "u1"
    assert goal.priority == "medium"
    assert goal.status == GoalStatus.ACTIVE


def test_goal_create_schema():
    body = GoalCreate(
        title="Learn Rust",
        deadline="2026-06-01T00:00:00",
        priority="high",
    )
    assert body.title == "Learn Rust"
    assert body.prefer_user_materials_only is False


def test_knowledge_total_hours():
    k = GoalKnowledge(
        goal_id="g1",
        topics=[
            Topic(title="A", est_hours=3.0),
            Topic(title="B", est_hours=5.0),
        ],
        estimated_total_hours=8.0,
    )
    assert k.estimated_total_hours == 8.0
    assert len(k.topics) == 2


def test_user_profile_defaults():
    u = UserProfile(user_id="u1")
    assert u.daily_capacity_hours == 8.0
    assert u.timezone == "UTC"


def test_time_window_allows_overnight_ranges():
    window = TimeWindow(start_hour=23, end_hour=7, days=[0, 1, 2])
    assert window.start_hour == 23
    assert window.end_hour == 7


def test_time_window_auto_extends_same_start_and_end():
    window = TimeWindow(start_hour=9, end_hour=9, days=[0])
    assert window.start_hour == 9
    assert window.end_hour == 10


def test_plan_allows_quality_metadata_fields():
    plan = Plan(
        user_id="u1",
        goal_id="g1",
        quality_score={"overall_score": 80.0},
        risk_flags={"deadline_risk": False},
        ai_recommendation_snapshot={"confidence": 0.8},
        fallback_reason=None,
        disruption_index=0.12,
        used_fallback=False,
        retry_triggered=True,
    )

    dumped = plan.model_dump(mode="json")
    assert dumped["quality_score"]["overall_score"] == 80.0
    assert dumped["retry_triggered"] is True
