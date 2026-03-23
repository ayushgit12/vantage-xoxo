"""Planner execution calibration helpers.

Build compact, bounded signals from historical execution data to improve planner AI
recommendations while keeping deterministic scheduling unchanged.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from shared.db.repositories import plans_repo

_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


async def summarize_user_execution_patterns(user_id: str, plan_limit: int = 300) -> dict[str, Any]:
    docs = await plans_repo.find_many({"user_id": user_id}, limit=plan_limit)

    total_blocks = 0
    done = 0
    partial = 0
    missed = 0

    minutes_by_dow: dict[int, float] = defaultdict(float)
    topic_totals: dict[str, int] = defaultdict(int)
    topic_missed: dict[str, int] = defaultdict(int)
    topic_partial: dict[str, int] = defaultdict(int)

    for plan in docs:
        for block in plan.get("micro_blocks", []):
            total_blocks += 1
            status = str(block.get("status", "scheduled")).lower()
            topic_id = str(block.get("topic_id", "") or "")
            topic_totals[topic_id] += 1

            if status == "done":
                done += 1
            elif status == "partial":
                partial += 1
                topic_partial[topic_id] += 1
            elif status == "missed":
                missed += 1
                topic_missed[topic_id] += 1

            # Day-of-week profile is based on executed work only.
            dt = _as_datetime(block.get("start_dt"))
            if dt and status in {"done", "partial"}:
                weight = float(block.get("duration_min", 0) or 0)
                if status == "partial":
                    weight *= 0.5
                minutes_by_dow[dt.weekday()] += max(0.0, weight)

    done_ratio = (done / total_blocks) if total_blocks else 0.0
    partial_ratio = (partial / total_blocks) if total_blocks else 0.0
    missed_ratio = (missed / total_blocks) if total_blocks else 0.0

    # Convert day workload to multipliers around 1.0 in a bounded range.
    profile: dict[str, float] = {k: 1.0 for k in _DAY_KEYS}
    if minutes_by_dow:
        avg = sum(minutes_by_dow.values()) / max(1, len(minutes_by_dow))
        if avg > 0:
            for dow in range(7):
                raw = minutes_by_dow.get(dow, 0.0) / avg
                profile[_DAY_KEYS[dow]] = round(max(0.7, min(1.3, raw)), 3)

    # Topic overrun factor: more misses/partials implies larger factor.
    topic_overrun_factors: dict[str, float] = {}
    for topic_id, count in topic_totals.items():
        if not topic_id or count <= 0:
            continue
        risk = (topic_missed.get(topic_id, 0) + 0.5 * topic_partial.get(topic_id, 0)) / count
        topic_overrun_factors[topic_id] = round(max(0.8, min(1.5, 1.0 + (risk * 0.5))), 3)

    return {
        "recent_done_ratio": round(done_ratio, 4),
        "recent_partial_ratio": round(partial_ratio, 4),
        "recent_missed_ratio": round(missed_ratio, 4),
        "day_capacity_profile": profile,
        "topic_overrun_factors": topic_overrun_factors,
        "sample_size_blocks": total_blocks,
        "sample_size_plans": len(docs),
    }
