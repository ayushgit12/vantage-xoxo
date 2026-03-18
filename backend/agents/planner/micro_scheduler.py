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
) -> list[MicroBlock]:
    """Deterministically schedule micro blocks into available slots."""
    rng = random.Random(seed)
    blocks: list[MicroBlock] = []

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
            used_today = daily_used.get(day_key, 0)
            if used_today >= max_daily_minutes:
                slot_index += 1
                continue

            # Check topic-per-day limit
            if day_key not in daily_topics:
                daily_topics[day_key] = set()
            if topic_id not in daily_topics[day_key] and len(daily_topics[day_key]) >= max_topics_per_day:
                slot_index += 1
                continue

            # Determine block duration
            daily_remaining = max_daily_minutes - used_today
            block_minutes = min(
                remaining,
                available_minutes,
                MAX_BLOCK_MINUTES,
                daily_remaining,
            )
            block_minutes = max(block_minutes, MIN_BLOCK_MINUTES)
            block_minutes = int(block_minutes)

            # Number of slots to consume
            slots_needed = block_minutes // SLOT_MINUTES
            if slots_needed > len(available_block):
                slot_index += 1
                continue

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
