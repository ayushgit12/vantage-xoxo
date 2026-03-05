"""Test fixtures."""

import pytest


@pytest.fixture
def sample_goal():
    return {
        "goal_id": "test-goal-001",
        "user_id": "test-user-001",
        "title": "Learn Machine Learning",
        "category": "course",
        "deadline": "2026-06-01T00:00:00",
        "priority": "high",
        "target_weekly_effort": 10.0,
        "prefer_user_materials_only": False,
        "material_urls": [],
        "uploaded_file_ids": [],
    }


@pytest.fixture
def sample_knowledge():
    from shared.models import GoalKnowledge, Topic, Milestone

    return GoalKnowledge(
        goal_id="test-goal-001",
        topics=[
            Topic(topic_id="t1", title="Linear Algebra", est_hours=5.0, prereq_ids=[]),
            Topic(topic_id="t2", title="Probability", est_hours=4.0, prereq_ids=[]),
            Topic(topic_id="t3", title="Supervised Learning", est_hours=6.0, prereq_ids=["t1", "t2"]),
            Topic(topic_id="t4", title="Neural Networks", est_hours=8.0, prereq_ids=["t3"]),
            Topic(topic_id="t5", title="Project", est_hours=10.0, prereq_ids=["t4"]),
        ],
        milestones=[
            Milestone(title="Math Foundations", topic_ids=["t1", "t2"]),
            Milestone(title="Core ML", topic_ids=["t3", "t4"]),
            Milestone(title="Capstone", topic_ids=["t5"]),
        ],
        estimated_total_hours=33.0,
        confidence_score=0.8,
    )
