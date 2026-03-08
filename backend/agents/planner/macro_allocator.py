"""Macro allocator — distribute estimated hours across the timeline.

NO LLM — pure proportional allocation.
"""

import logging
from datetime import datetime, timedelta, timezone

from shared.models import GoalKnowledge, MacroAllocation

logger = logging.getLogger(__name__)


def compute_macro_allocations(
    knowledge: GoalKnowledge,
    deadline: datetime | str,
    target_weekly_effort: float | None = None,
    window_days: int = 7,
) -> list[MacroAllocation]:
    """Distribute estimated hours across weeks until deadline."""
    if isinstance(deadline, str):
        deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))

    # Ensure deadline is timezone-aware
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    total_hours = knowledge.estimated_total_hours

    # If deadline is in the past, extend it to at least window_days from now
    if deadline <= now:
        logger.warning("Deadline %s is in the past; extending to %d days from now", deadline, window_days)
        deadline = now + timedelta(days=window_days)

    days_remaining = max((deadline - now).days, 1)
    weeks_remaining = max(days_remaining / 7, 1)

    # Determine weekly effort
    if target_weekly_effort:
        weekly_effort = target_weekly_effort
    else:
        weekly_effort = total_hours / weeks_remaining

    allocations: list[MacroAllocation] = []

    # Sort topics by dependency order (topological sort)
    ordered_topics = _topological_sort(knowledge.topics)

    # Allocate hours proportionally across weeks
    remaining_per_topic = {t.topic_id: t.est_hours for t in ordered_topics}

    week_number = 0
    while sum(remaining_per_topic.values()) > 0.1 and week_number < 52:
        week_start = now + timedelta(weeks=week_number)
        if week_start > deadline:
            break

        budget = weekly_effort

        for topic in ordered_topics:
            if budget <= 0:
                break
            remaining = remaining_per_topic.get(topic.topic_id, 0)
            if remaining <= 0:
                continue

            # Check prerequisites met
            prereqs_met = all(
                remaining_per_topic.get(pid, 0) <= 0
                for pid in topic.prereq_ids
            )

            if not prereqs_met and week_number < weeks_remaining - 1:
                continue  # Skip unless it's the last chance

            alloc = min(remaining, budget)
            allocations.append(MacroAllocation(
                goal_id=knowledge.goal_id,
                topic_id=topic.topic_id,
                week_start=week_start,
                allocated_hours=round(alloc, 1),
            ))
            remaining_per_topic[topic.topic_id] -= alloc
            budget -= alloc

        week_number += 1

    logger.info(
        "Macro allocation: %d entries over %d weeks for %.1fh total",
        len(allocations), week_number, total_hours,
    )
    return allocations


def _topological_sort(topics) -> list:
    """Sort topics respecting prerequisite dependencies."""
    id_to_topic = {t.topic_id: t for t in topics}
    visited = set()
    order = []

    def visit(tid: str):
        if tid in visited:
            return
        visited.add(tid)
        topic = id_to_topic.get(tid)
        if topic:
            for prereq in topic.prereq_ids:
                visit(prereq)
            order.append(topic)

    for t in topics:
        visit(t.topic_id)

    return order
