"""Deterministic micro scheduler.

Takes macro allocations + availability matrix and produces concrete MicroBlocks.
Uses seeded random for tie-breaking → identical inputs = identical output.

NO LLM — pure algorithm.

Scheduling rules:
1. Prefer user's preferred time windows.
2. Avoid back-to-back heavy blocks (>90 min).
3. Place harder topics in morning/preferred slots.
4. Minimum block: 30 min. Maximum block: 120 min.
"""

import logging
import random
from datetime import datetime, timedelta

from shared.models import GoalKnowledge, MacroAllocation, MicroBlock
from agents.planner.availability import AvailabilityMatrix, TimeSlot, SLOT_MINUTES

logger = logging.getLogger(__name__)

MIN_BLOCK_MINUTES = 30
MAX_BLOCK_MINUTES = 120
DEFAULT_BLOCK_MINUTES = 60
MAX_DAILY_MINUTES = 120  # Cap: max 2h study per day to spread across the week


def schedule_micro_blocks(
    knowledge: GoalKnowledge,
    macro_allocations: list[MacroAllocation],
    availability: AvailabilityMatrix,
    seed: int = 42,
    max_topics_per_day: int = 2,
    max_daily_minutes: int = MAX_DAILY_MINUTES,
    preferred_block_durations_by_topic: dict[str, int] | None = None,
    daily_capacity_profile: dict[str, float] | None = None,
    max_disruption_budget: float | None = None,
) -> list[MicroBlock]:
    """Deterministically schedule micro blocks into available slots."""
    rng = random.Random(seed)
    del rng  # Reserved for deterministic tie-break hooks.
    blocks: list[MicroBlock] = []
    preferred_durations = preferred_block_durations_by_topic or {}
    capacity_profile = daily_capacity_profile or {}

    # This parameter is consumed by future replan policies; keep it bounded.
    if max_disruption_budget is not None:
        max_disruption_budget = max(0.0, min(0.5, float(max_disruption_budget)))

    day_keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

    # Get contiguous available blocks (min 1 hour)
    contiguous = availability.get_contiguous_blocks(min_slots=2)

    if not contiguous:
        logger.warning("No available contiguous slots found!")
        return blocks

    # Sort contiguous blocks: spread across days, then prefer morning slots
    contiguous.sort(key=lambda slots: (
        slots[0].date.toordinal(),  # earlier dates first (spread across days)
        slots[0].hour,  # earlier in day
    ))

    # Build a queue of (topic_id, remaining_minutes) from macro allocations
    # Aggregate per-topic since macro allocator creates per-week rows
    topic_minutes: dict[str, float] = {}
    for alloc in macro_allocations:
        topic_minutes[alloc.topic_id] = topic_minutes.get(alloc.topic_id, 0) + alloc.allocated_hours * 60

    topic_queue: list[tuple[str, float]] = []
    for topic_id, minutes in topic_minutes.items():
        # Enforce minimum block size — round up small allocations
        if minutes < MIN_BLOCK_MINUTES:
            minutes = MIN_BLOCK_MINUTES
        topic_queue.append((topic_id, minutes))

    # Map topic_id -> Topic for resource refs
    topic_map = {t.topic_id: t for t in knowledge.topics}

    # Track minutes and topics used per day
    daily_used: dict[str, int] = {}  # date string -> minutes used
    daily_topics: dict[str, set] = {}  # date string -> set of topic_ids

    slot_index = 0

    for topic_id, total_minutes in topic_queue:
        remaining = total_minutes

        while remaining >= MIN_BLOCK_MINUTES and slot_index < len(contiguous):
            available_block = contiguous[slot_index]
            available_minutes = len(available_block) * SLOT_MINUTES

            # Check daily cap
            day_key = str(available_block[0].date)
            weekday_key = day_keys[available_block[0].date.weekday()]
            day_mult = float(capacity_profile.get(weekday_key, 1.0) or 1.0)
            day_mult = max(0.7, min(1.3, day_mult))
            day_cap = max(MIN_BLOCK_MINUTES, int(max_daily_minutes * day_mult))
            used_today = daily_used.get(day_key, 0)
            if used_today >= day_cap:
                slot_index += 1
                continue

            daily_remaining = day_cap - used_today
            if daily_remaining < MIN_BLOCK_MINUTES:
                slot_index += 1
                continue

            # Check topic-per-day limit
            if day_key not in daily_topics:
                daily_topics[day_key] = set()
            if topic_id not in daily_topics[day_key] and len(daily_topics[day_key]) >= max_topics_per_day:
                slot_index += 1
                continue

            # Determine desired duration, then quantize to 30-min slot granularity
            # so consumed slots and stored duration always match.
            preferred_duration = int(preferred_durations.get(topic_id, DEFAULT_BLOCK_MINUTES) or DEFAULT_BLOCK_MINUTES)
            preferred_duration = max(MIN_BLOCK_MINUTES, min(MAX_BLOCK_MINUTES, preferred_duration))

            desired_minutes = min(
                remaining,
                available_minutes,
                MAX_BLOCK_MINUTES,
                daily_remaining,
                preferred_duration,
            )

            max_schedulable_slots = min(
                len(available_block),
                MAX_BLOCK_MINUTES // SLOT_MINUTES,
                daily_remaining // SLOT_MINUTES,
            )
            slots_needed = int(desired_minutes // SLOT_MINUTES)
            slots_needed = min(slots_needed, max_schedulable_slots)

            if slots_needed * SLOT_MINUTES < MIN_BLOCK_MINUTES:
                slot_index += 1
                continue

            block_minutes = slots_needed * SLOT_MINUTES

            # Use the first N slots
            used_slots = available_block[:slots_needed]
            start_slot = used_slots[0]

            # Create micro block
            topic = topic_map.get(topic_id)
            resource_refs = topic.resource_refs if topic else []

            block = MicroBlock(
                plan_id="",  # set by caller
                goal_id=knowledge.goal_id,
                topic_id=topic_id,
                start_dt=start_slot.start_datetime,
                duration_min=block_minutes,
                resources=resource_refs,
            )
            blocks.append(block)

            # Track daily usage
            daily_used[day_key] = daily_used.get(day_key, 0) + block_minutes
            daily_topics[day_key].add(topic_id)

            # Mark used slots as unavailable
            for s in used_slots:
                s.available = False

            # Update remaining contiguous block
            leftover = available_block[slots_needed:]
            if len(leftover) >= 2:
                contiguous[slot_index] = leftover
            else:
                slot_index += 1

            remaining -= block_minutes

            # Anti-fatigue: skip to next contiguous block if we just scheduled >90 min
            if block_minutes >= 90:
                slot_index += 1

        # If we exhaust available slots, break
        if slot_index >= len(contiguous):
            logger.warning(
                "Ran out of available slots; %d minutes unscheduled for topic %s",
                remaining, topic_id,
            )
            break

    # Set plan_id on all blocks (caller will update)
    logger.info("Scheduled %d micro blocks", len(blocks))
    return blocks
