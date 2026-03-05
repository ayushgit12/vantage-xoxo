"""Assemble final GoalKnowledge from extracted data."""

from uuid import uuid4
from shared.models.knowledge import GoalKnowledge, Topic, Milestone, ResourceRef


def build_knowledge(
    goal_id: str,
    topics: list[dict],
    milestones: list[dict],
    resource_refs: list[ResourceRef],
    confidence: float,
) -> GoalKnowledge:
    """Build a GoalKnowledge object from extraction results."""

    # Convert raw topic dicts to Topic models
    topic_id_map: dict[str, str] = {}  # title -> topic_id
    topic_models: list[Topic] = []

    for t in topics:
        topic_id = str(uuid4())
        topic_id_map[t["title"]] = topic_id
        topic_models.append(Topic(
            topic_id=topic_id,
            title=t["title"],
            description=t.get("description", ""),
            est_hours=t.get("est_hours", 1.0),
            prereq_ids=[],  # resolved below
            resource_refs=[r.ref_id for r in resource_refs if r.title in t.get("title", "")],
        ))

    # Resolve prerequisite IDs
    for i, t in enumerate(topics):
        prereq_titles = t.get("prereq_titles", [])
        topic_models[i].prereq_ids = [
            topic_id_map[pt] for pt in prereq_titles if pt in topic_id_map
        ]

    # Convert milestones
    milestone_models: list[Milestone] = []
    for m in milestones:
        milestone_models.append(Milestone(
            title=m["title"],
            description=m.get("description", ""),
            topic_ids=[
                topic_id_map[tt] for tt in m.get("topic_titles", []) if tt in topic_id_map
            ],
        ))

    total_hours = sum(t.est_hours for t in topic_models)

    return GoalKnowledge(
        goal_id=goal_id,
        topics=topic_models,
        milestones=milestone_models,
        estimated_total_hours=round(total_hours, 1),
        resource_refs=resource_refs,
        confidence_score=confidence,
    )
