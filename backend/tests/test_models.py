"""Test data models."""

from shared.models import Goal, GoalCreate, GoalKnowledge, Topic, Plan, MicroBlock, UserProfile


def test_goal_creation():
    goal = Goal(
        user_id="u1",
        title="Learn Rust",
        deadline="2026-06-01T00:00:00",
    )
    assert goal.goal_id
    assert goal.user_id == "u1"
    assert goal.priority == "medium"


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
