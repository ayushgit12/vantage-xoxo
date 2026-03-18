"""Helpers for reviewing and patching GoalKnowledge topics.

These functions power manual topic edits without rerunning the whole retriever.
"""

from datetime import datetime, timezone
import re

from shared.models import GoalKnowledge, Topic, TopicCreateRequest, TopicUpdateRequest


def normalize_topic_title(title: str) -> str:
    """Normalize a title for exact duplicate checks."""
    normalized = re.sub(r"[^a-z0-9]+", " ", title.strip().lower())
    return re.sub(r"\s+", " ", normalized).strip()


def recompute_total_hours(knowledge: GoalKnowledge) -> GoalKnowledge:
    knowledge.estimated_total_hours = round(sum(topic.est_hours for topic in knowledge.topics), 1)
    knowledge.updated_at = datetime.now(timezone.utc)
    return knowledge


def _ensure_unique_title(topics: list[Topic], title: str, exclude_topic_id: str | None = None) -> None:
    normalized = normalize_topic_title(title)
    for topic in topics:
        if exclude_topic_id and topic.topic_id == exclude_topic_id:
            continue
        if normalize_topic_title(topic.title) == normalized:
            raise ValueError(f"Topic '{title}' already exists")


def _ensure_prereqs_exist(knowledge: GoalKnowledge, prereq_ids: list[str], exclude_topic_id: str | None = None) -> None:
    valid_topic_ids = {topic.topic_id for topic in knowledge.topics}
    if exclude_topic_id:
        valid_topic_ids.add(exclude_topic_id)
    missing = [topic_id for topic_id in prereq_ids if topic_id not in valid_topic_ids]
    if missing:
        raise ValueError(f"Unknown prerequisite topic ids: {missing}")


def add_topic(knowledge: GoalKnowledge, payload: TopicCreateRequest) -> GoalKnowledge:
    _ensure_unique_title(knowledge.topics, payload.title)
    _ensure_prereqs_exist(knowledge, payload.prereq_ids)

    knowledge.topics.append(
        Topic(
            title=payload.title.strip(),
            description=payload.description,
            est_hours=payload.est_hours,
            prereq_ids=payload.prereq_ids,
            resource_refs=payload.resource_refs,
            source="user",
            locked_fields=["title", "description", "est_hours", "prereq_ids", "resource_refs"],
        )
    )
    return recompute_total_hours(knowledge)


def update_topic(knowledge: GoalKnowledge, topic_id: str, payload: TopicUpdateRequest) -> GoalKnowledge:
    topic = next((topic for topic in knowledge.topics if topic.topic_id == topic_id), None)
    if topic is None:
        raise ValueError(f"Topic {topic_id} not found")

    updates = payload.model_dump(exclude_none=True)
    if "title" in updates:
        updates["title"] = updates["title"].strip()
        _ensure_unique_title(knowledge.topics, updates["title"], exclude_topic_id=topic_id)
    if "prereq_ids" in updates:
        _ensure_prereqs_exist(knowledge, updates["prereq_ids"], exclude_topic_id=topic_id)
        if topic_id in updates["prereq_ids"]:
            raise ValueError("A topic cannot depend on itself")

    for field_name, field_value in updates.items():
        setattr(topic, field_name, field_value)
        if field_name not in topic.locked_fields:
            topic.locked_fields.append(field_name)

    topic.source = "user"
    return recompute_total_hours(knowledge)


def delete_topic(knowledge: GoalKnowledge, topic_id: str) -> GoalKnowledge:
    topic = next((topic for topic in knowledge.topics if topic.topic_id == topic_id), None)
    if topic is None:
        raise ValueError(f"Topic {topic_id} not found")

    knowledge.topics = [item for item in knowledge.topics if item.topic_id != topic_id]

    for remaining_topic in knowledge.topics:
        remaining_topic.prereq_ids = [prereq_id for prereq_id in remaining_topic.prereq_ids if prereq_id != topic_id]

    for milestone in knowledge.milestones:
        milestone.topic_ids = [item_id for item_id in milestone.topic_ids if item_id != topic_id]

    return recompute_total_hours(knowledge)