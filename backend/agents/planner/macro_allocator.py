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
    effort_adjustment_per_topic: dict[str, float] | None = None,
    urgency_boost_per_topic: dict[str, float] | None = None,
) -> list[MacroAllocation]:
    """Allocate study hours for the current window only.

    Args:
        knowledge: GoalKnowledge with topics and estimated_total_hours.
        deadline: Goal deadline (datetime or ISO string).
        target_weekly_effort: User-specified hours/week override.
        window_days: How many days the current plan covers (default 7).
        done_minutes_per_topic: Minutes already done/partial per topic_id.
            Pass this so topics that are already finished don't get re-allocated.
        effort_adjustment_per_topic: Optional multiplier per topic_id for expected
            effort (bounded to [0.8, 1.5]). Values >1 increase allocated need.
        urgency_boost_per_topic: Optional urgency boost per topic_id in [-0.5, 0.5].
            Higher urgency is considered earlier among currently-eligible topics.
    """
    if isinstance(deadline, str):
        deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    done_minutes = done_minutes_per_topic or {}
    effort_adj = effort_adjustment_per_topic or {}
    urgency_boost = urgency_boost_per_topic or {}

    # If deadline is in the past extend it so we still get one window.
    if deadline <= now:
        logger.warning("Deadline %s is in the past; extending to %d days from now", deadline, window_days)
        deadline = now + timedelta(days=window_days)

    days_remaining = max((deadline - now).days, 1)
    weeks_remaining = days_remaining / 7.0

    # Total hours still unfinished across all topics.
    ordered_topics = _topological_sort(knowledge.topics)
    remaining_per_topic: dict[str, float] = {}
    for topic in ordered_topics:
        effort_factor = float(effort_adj.get(topic.topic_id, 1.0) or 1.0)
        effort_factor = max(0.8, min(1.5, effort_factor))
        adjusted_est_hours = topic.est_hours * effort_factor
        done_h = done_minutes.get(topic.topic_id, 0) / 60.0
        remaining_per_topic[topic.topic_id] = max(0.0, adjusted_est_hours - done_h)

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
    alloc_map: dict[str, float] = {}  # topic_id -> hours allocated so far
    budget = window_budget
    week_start = now

    # Track topics fully covered (done or fully allocated) so downstream
    # topics whose prereqs are met can be unlocked in the same window.
    covered_in_window: set[str] = set()

    # Seed with already-done topics.
    for topic in ordered_topics:
        if remaining_per_topic.get(topic.topic_id, 0.0) <= 0.0:
            covered_in_window.add(topic.topic_id)

    def _prereq_ready(pid: str) -> bool:
        """A prereq is ready if done, fully allocated, or has meaningful allocation."""
        if pid in covered_in_window:
            return True
        remaining = remaining_per_topic.get(pid, 0.0)
        if remaining <= 0.0:
            return True
        allocated = alloc_map.get(pid, 0.0)
        # Once ≥30% is allocated in this window, consider it started enough
        # for downstream topics to begin (interleaved practice).
        return allocated >= remaining * 0.3

    # Multi-pass: each pass finds all eligible topics, caps per-topic allocation
    # to ensure variety, and cascades unlocks to downstream topics.
    #
    # Use more than one pass-per-topic so we can keep allocating while budget
    # remains, instead of stopping after eligibility set stabilization.
    MAX_PASSES = max(len(ordered_topics) * 8, 8)
    for _ in range(MAX_PASSES):
        if budget < 0.05:
            break

        eligible: list = []
        for topic in ordered_topics:
            if topic.topic_id in covered_in_window:
                continue
            remaining = remaining_per_topic.get(topic.topic_id, 0.0)
            already = alloc_map.get(topic.topic_id, 0.0)
            need = remaining - already
            if need <= 0.01:
                covered_in_window.add(topic.topic_id)
                continue
            if all(_prereq_ready(pid) for pid in topic.prereq_ids):
                eligible.append((topic, need))

        if not eligible:
            break

        # Sort smallest-need first to maximize the number of fully-covered topics.
        # If urgency is provided, prioritize higher urgency first for this pass.
        eligible.sort(key=lambda tn: (
            -max(-0.5, min(0.5, float(urgency_boost.get(tn[0].topic_id, 0.0) or 0.0))),
            tn[1],
        ))

        # Cap per-topic allocation to spread budget across at least 3 topics
        # (interleaved practice) while still allowing small topics to finish.
        # When <=2 topics are eligible, allow larger allocations so budget
        # isn't artificially stranded by repeated tiny passes.
        per_topic_cap = (
            budget
            if len(eligible) <= 2
            else max(budget / max(len(eligible), 3), 1.0)
        )

        progress_made = False

        for topic, need in eligible:
            if budget < 0.05:
                break
            alloc = min(need, budget, per_topic_cap)
            if alloc < 0.01:
                continue
            alloc_map[topic.topic_id] = alloc_map.get(topic.topic_id, 0.0) + alloc
            budget -= alloc
            progress_made = True
            if alloc >= need - 0.01:
                covered_in_window.add(topic.topic_id)

        # Guard against pathological no-op loops.
        if not progress_made:
            break

    # Convert accumulated allocations to MacroAllocation objects.
    for topic in ordered_topics:
        hours = alloc_map.get(topic.topic_id, 0.0)
        if hours >= 0.01:
            allocations.append(MacroAllocation(
                goal_id=knowledge.goal_id,
                topic_id=topic.topic_id,
                week_start=week_start,
                allocated_hours=round(hours, 2),
            ))

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

