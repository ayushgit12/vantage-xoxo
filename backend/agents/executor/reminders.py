"""Reminder and daily summary logic."""

import logging
from datetime import datetime, timedelta
from shared.models import Plan, MicroBlock, BlockStatus

logger = logging.getLogger(__name__)


def generate_daily_summary(plan: Plan, target_date: datetime | None = None) -> dict:
    """Generate a summary of blocks for a given day."""
    if target_date is None:
        target_date = datetime.utcnow()

    day_start = target_date.replace(hour=0, minute=0, second=0)
    day_end = day_start + timedelta(days=1)

    todays_blocks = [
        b for b in plan.micro_blocks
        if day_start <= b.start_dt < day_end
    ]

    total_min = sum(b.duration_min for b in todays_blocks)
    done = sum(1 for b in todays_blocks if b.status == BlockStatus.DONE)
    remaining = sum(1 for b in todays_blocks if b.status == BlockStatus.SCHEDULED)

    return {
        "date": target_date.date().isoformat(),
        "total_blocks": len(todays_blocks),
        "total_minutes": total_min,
        "done": done,
        "remaining": remaining,
        "blocks": [
            {
                "block_id": b.block_id,
                "topic_id": b.topic_id,
                "start": b.start_dt.isoformat(),
                "duration_min": b.duration_min,
                "status": b.status,
            }
            for b in todays_blocks
        ],
    }
