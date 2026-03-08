"""Macro allocator — distribute estimated hours across the scheduling window.

NO LLM — pure proportional allocation.

Design decision: we only allocate for the current `window_days` window (default 7),
NOT for every week until the deadline.  Reasons:
  1. The AvailabilityMatrix only covers window_days, so multi-week allocations are
     silently dropped by the micro-scheduler — they produce phantom work that never
     lands in a block.
  2. Replanning is cheap; the next replan advances the window forward.
  3. It naturally handles changing availability without over-committing.

Done/partial effort is deducted before allocation so a topic that is 80% finished
does not receive a full weekly slice on every replan.
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
    done_minutes_per_topic: dict[str, int] | None = None,
) -> list[MacroAllocation]:
    """Allocate study hours for the current window only.

    Args:
        knowledge: GoalKnowledge with topics and estimated_total_hours.
        deadline: Goal deadline (datetime or ISO string).
        target_weekly_effort: User-specified hours/week override.
        window_days: How many days the current plan covers (default 7).
        done_minutes_per_topic: Minutes already done/partial per topic_id.
            Pass this so topics that are already finished don't get re-allocated.
    """
    if isinstance(deadline, str):
        deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    done_minutes = done_minutes_per_topic or {}

    # If deadline is in the past extend it so we still get one window.
    if deadline <= now:
        logger.warning("Deadline %s is in the past; extending to %d days from now", deadline, window_days)
        deadline = now + timedelta(days=window_days)

    days_remaining = max((deadline - now).days, 1)
    weeks_remaining = max(days_remaining / 7, 1.0)

    # Total hours still unfinished across all topics.
    ordered_topics = _topological_sort(knowledge.topics)
    remaining_per_topic: dict[str, float] = {}
    for topic in ordered_topics:
        done_h = done_minutes.get(topic.topic_id, 0) / 60.0
        remaining_per_topic[topic.topic_id] = max(0.0, topic.est_hours - done_h)

    total_remaining = sum(remaining_per_topic.values())

    if total_remaining <= 0.01:
        logger.info("All topics fully done — no allocation needed")
        return []

    # Weekly effort budget for this goal.
    if target_weekly_effort:
        weekly_effort = float(target_weekly_effort)
    else:
        weekly_effort = total_remaining / weeks_remaining

    # Scale to the current window only.
    window_budget = weekly_effort * (window_days / 7.0)

    allocations: list[MacroAllocation] = []
    budget = window_budget
    # All blocks land in week 0 — the micro-scheduler maps them into real slots.
    week_start = now

    for topic in ordered_topics:
        if budget < 0.05:
            break
        remaining = remaining_per_topic.get(topic.topic_id, 0.0)
        if remaining <= 0.0:
            continue  # fully done

        # Only schedule a topic when all its prerequisites have been completed.
        prereqs_done = all(
            remaining_per_topic.get(pid, 0.0) <= 0.0
            for pid in topic.prereq_ids
        )
        if not prereqs_done:
            continue  # wait for prereqs to finish in future windows

        alloc = min(remaining, budget)
        allocations.append(MacroAllocation(
            goal_id=knowledge.goal_id,
            topic_id=topic.topic_id,
            week_start=week_start,
            allocated_hours=round(alloc, 2),
        ))
        budget -= alloc

    logger.info(
        "Macro allocation (window=%dd, budget=%.2fh): %d topics allocated, %.2fh total",
        window_days, window_budget, len(allocations),
        sum(a.allocated_hours for a in allocations),
    )
    return allocations


def _topological_sort(topics) -> list:
    """Sort topics respecting prerequisite dependencies (Kahn/DFS)."""
    id_to_topic = {t.topic_id: t for t in topics}
    visited: set[str] = set()
    order: list = []

    def visit(tid: str) -> None:
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

