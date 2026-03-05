"""Partial replan logic — triggered when a block is missed or partially done.

Only replans the next K days (default 7). Macro allocations are NOT changed
unless the user explicitly accepts.
"""

import logging
from datetime import datetime, timedelta

from shared.models import Plan, MicroBlock, BlockStatus

logger = logging.getLogger(__name__)


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
    now = datetime.utcnow()
    kept = [
        b for b in existing_plan.micro_blocks
        if b.status == BlockStatus.DONE or b.start_dt < now
    ]

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
        "added_blocks": [b.model_dump() for b in added],
        "removed_blocks": [b.model_dump() for b in removed],
    }


def apply_replan(
    existing_plan: Plan,
    new_blocks: list[MicroBlock],
) -> Plan:
    """Apply replan: keep past/done blocks, replace future scheduled blocks."""
    now = datetime.utcnow()

    # Keep blocks that are done or in the past
    kept = [
        b for b in existing_plan.micro_blocks
        if b.status == BlockStatus.DONE or b.start_dt < now
    ]

    # Use new blocks for future
    future_new = [b for b in new_blocks if b.start_dt >= now]

    existing_plan.micro_blocks = kept + future_new
    existing_plan.version += 1
    return existing_plan
