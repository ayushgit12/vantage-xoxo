"""Tests for manual GoalKnowledge topic review helpers."""

import pytest

from agents.retriever.review import add_topic, delete_topic, normalize_topic_title, update_topic
from shared.models import TopicCreateRequest, TopicUpdateRequest


def test_normalize_topic_title_collapses_variants():
    assert normalize_topic_title("  Intro-to Python!! ") == "intro to python"


def test_add_topic_recomputes_total_and_marks_user_source(sample_knowledge):
    updated = add_topic(
        sample_knowledge,
        TopicCreateRequest(title="Model Evaluation", est_hours=3.5, prereq_ids=["t3"]),
    )

    created = next(topic for topic in updated.topics if topic.title == "Model Evaluation")
    assert created.source == "user"
    assert "est_hours" in created.locked_fields
    assert updated.estimated_total_hours == 36.5


def test_add_topic_rejects_duplicate_titles(sample_knowledge):
    with pytest.raises(ValueError, match="already exists"):
        add_topic(
            sample_knowledge,
            TopicCreateRequest(title="  linear algebra ", est_hours=2.0),
        )


def test_update_topic_recomputes_total_and_locks_fields(sample_knowledge):
    updated = update_topic(
        sample_knowledge,
        "t2",
        TopicUpdateRequest(title="Probability Basics", est_hours=5.5),
    )

    topic = next(topic for topic in updated.topics if topic.topic_id == "t2")
    assert topic.title == "Probability Basics"
    assert topic.est_hours == 5.5
    assert topic.source == "user"
    assert "title" in topic.locked_fields
    assert updated.estimated_total_hours == 34.5


def test_delete_topic_removes_prereq_and_milestone_references(sample_knowledge):
    updated = delete_topic(sample_knowledge, "t3")

    assert all(topic.topic_id != "t3" for topic in updated.topics)
    neural_networks = next(topic for topic in updated.topics if topic.topic_id == "t4")
    assert "t3" not in neural_networks.prereq_ids
    assert all("t3" not in milestone.topic_ids for milestone in updated.milestones)
    assert updated.estimated_total_hours == 27.0


def test_update_topic_rejects_self_dependency(sample_knowledge):
    with pytest.raises(ValueError, match="cannot depend on itself"):
        update_topic(sample_knowledge, "t1", TopicUpdateRequest(prereq_ids=["t1"]))