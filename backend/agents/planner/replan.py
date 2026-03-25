"""Partial replan logic — triggered when a block is missed or partially done.

Only replans the next K days (default 7). Macro allocations are NOT changed
unless the user explicitly accepts.
"""

import logging
import math
from datetime import datetime, timedelta, timezone

from shared.models import Plan, MicroBlock, BlockStatus

logger = logging.getLogger(__name__)


def _sig(block: MicroBlock) -> tuple[str, str, int]:
    return (block.topic_id, block.start_dt.isoformat(), int(block.duration_min))


def disruption_index(existing_plan: Plan, new_blocks: list[MicroBlock]) -> float:
    """Compute normalized churn between existing future-scheduled and new blocks.

    Uses slot signatures instead of block IDs so deterministic re-generations with
    new UUIDs are not treated as full churn.
    """
    now = datetime.now(timezone.utc)
    existing_future = [
        b for b in existing_plan.micro_blocks
        if b.start_dt >= now and b.status == BlockStatus.SCHEDULED
    ]
    candidate_future = [b for b in new_blocks if b.start_dt >= now]

    existing_sigs = {_sig(b) for b in existing_future}
    candidate_sigs = {_sig(b) for b in candidate_future}

    if not existing_sigs and not candidate_sigs:
        return 0.0

    removed = existing_sigs - candidate_sigs
    added = candidate_sigs - existing_sigs
    denom = max(1, len(existing_sigs) + len(candidate_sigs))
    return max(0.0, min(1.0, (len(removed) + len(added)) / denom))


def enforce_disruption_budget(
    existing_plan: Plan,
    new_blocks: list[MicroBlock],
    budget: float,
) -> tuple[list[MicroBlock], float, bool]:
    """Attempt to keep disruption under budget by preserving stable signatures.

    This is best-effort and deterministic; it preserves already-matching blocks and
    may reintroduce some prior blocks if churn is significantly above budget.
    """
    budget = max(0.0, min(0.5, float(budget)))
    idx = disruption_index(existing_plan, new_blocks)
    if idx <= budget:
        return new_blocks, idx, False

    now = datetime.now(timezone.utc)
    existing_future = [
        b for b in existing_plan.micro_blocks
        if b.start_dt >= now and b.status == BlockStatus.SCHEDULED
    ]
    candidate_future = [b for b in new_blocks if b.start_dt >= now]

    existing_by_sig = {_sig(b): b for b in existing_future}
    candidate_by_sig = {_sig(b): b for b in candidate_future}

    # Keep all already-stable blocks.
    chosen: dict[tuple[str, str, int], MicroBlock] = {
        s: b for s, b in candidate_by_sig.items() if s in existing_by_sig
    }

    target_keep = int(math.ceil((1.0 - budget) * max(1, len(existing_future))))

    # Reintroduce prior blocks first (chronological), then candidate-only blocks.
    for b in sorted(existing_future, key=lambda x: x.start_dt):
        s = _sig(b)
        if len(chosen) >= target_keep:
            break
        if s not in chosen:
            chosen[s] = b

    for b in sorted(candidate_future, key=lambda x: x.start_dt):
        s = _sig(b)
        if s not in chosen:
            chosen[s] = b

    adjusted_future = sorted(chosen.values(), key=lambda x: x.start_dt)
    past_or_done = []
    for b in existing_plan.micro_blocks:
        if b.start_dt < now or b.status in (BlockStatus.DONE, BlockStatus.PARTIAL):
            if b.start_dt < now and b.status == BlockStatus.SCHEDULED:
                b.status = BlockStatus.MISSED
            past_or_done.append(b)
    merged = past_or_done + adjusted_future
    adjusted_idx = disruption_index(existing_plan, merged)
    return merged, adjusted_idx, True


def compute_replan_diff(
    existing_plan: Plan,
    new_blocks: list[MicroBlock],
) -> dict:
    """Compare existing plan blocks with proposed new blocks.

    Returns a diff showing which blocks are added, removed, or moved.
    """
    existing_ids = {b.block_id for b in existing_plan.micro_blocks}
    new_ids = {b.block_id for b in new_blocks}

    # Blocks in existing that are done or in the past: keep them
    now = datetime.now(timezone.utc)
    kept = []
    for b in existing_plan.micro_blocks:
        if b.status in (BlockStatus.DONE, BlockStatus.PARTIAL) or b.start_dt < now:
            if b.start_dt < now and b.status == BlockStatus.SCHEDULED:
                b.status = BlockStatus.MISSED
            kept.append(b)

    # New blocks that replace future scheduled blocks
    added = [b for b in new_blocks if b.block_id not in existing_ids]
    removed = [
        b for b in existing_plan.micro_blocks
        if b.block_id not in new_ids
        and b.start_dt >= now
        and b.status == BlockStatus.SCHEDULED
    ]

    return {
        "kept": len(kept),
        "added": len(added),
        "removed": len(removed),
        "added_blocks": [b.model_dump(mode="json") for b in added],
        "removed_blocks": [b.model_dump(mode="json") for b in removed],
    }


def apply_replan(
    existing_plan: Plan,
    new_blocks: list[MicroBlock],
) -> Plan:
    """Apply replan: keep past/done blocks, replace future scheduled blocks."""
    now = datetime.now(timezone.utc)

    # Keep blocks that are done or in the past
    kept = []
    for b in existing_plan.micro_blocks:
        if b.status in (BlockStatus.DONE, BlockStatus.PARTIAL) or b.start_dt < now:
            if b.start_dt < now and b.status == BlockStatus.SCHEDULED:
                b.status = BlockStatus.MISSED
            kept.append(b)

    # Use new blocks for future
    future_new = [b for b in new_blocks if b.start_dt >= now]

    existing_plan.micro_blocks = kept + future_new
    existing_plan.version += 1
    return existing_plan
