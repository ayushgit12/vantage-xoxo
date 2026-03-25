"""Daily sweeper — background job for rolling window and block auto-marking.

This module provides the logic for:
  B1: Rolling window auto-replan (advances the 7-day scheduling window daily)
  B2: Block grace period auto-mark (SCHEDULED → MISSED after grace period expires)
  B3: Goal auto-completion (ACTIVE → COMPLETED when all hours are done)

Run this as a daily cron job or call sweep_all_users() from a scheduler.
"""

import logging
from datetime import datetime, timedelta, timezone

from shared.db.repositories import goals_repo, plans_repo, users_repo, knowledge_repo
from shared.models.goal import GoalStatus
from agents.planner.agent import replan_all_goals

logger = logging.getLogger(__name__)

DEFAULT_GRACE_HOURS = 24


async def sweep_user(user_id: str, window_days: int = 7) -> dict:
    """Run the daily sweep for a single user.

    1. Auto-mark expired blocks as MISSED
    2. Auto-complete goals where all work is done
    3. Trigger rolling replan to generate the next window
    """
    now = datetime.now(timezone.utc)
    stats = {"blocks_auto_missed": 0, "goals_auto_completed": 0, "plans_regenerated": 0}

    # Load user profile for grace period setting
    user_doc = await users_repo.find_by_id(user_id, id_field="user_id")
    grace_hours = DEFAULT_GRACE_HOURS
    if user_doc and user_doc.get("block_grace_hours") is not None:
        grace_hours = int(user_doc["block_grace_hours"])

    # --- B2: Auto-mark expired blocks ---
    all_goals = await goals_repo.find_many({"user_id": user_id})
    for goal_doc in all_goals:
        plan_id = goal_doc.get("active_plan_id")
        if not plan_id:
            continue

        plan_doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
        if not plan_doc:
            continue

        modified = False
        for block in plan_doc.get("micro_blocks", []):
            if block.get("status") != "scheduled":
                continue

            bstart = block.get("start_dt")
            if isinstance(bstart, str):
                bstart = datetime.fromisoformat(bstart.replace("Z", "+00:00"))
            if isinstance(bstart, datetime) and bstart.tzinfo is None:
                bstart = bstart.replace(tzinfo=timezone.utc)
            if not bstart:
                continue

            duration_min = int(block.get("duration_min", 0) or 0)
            block_end = bstart + timedelta(minutes=duration_min)
            grace_deadline = block_end + timedelta(hours=grace_hours)

            if now > grace_deadline:
                block["status"] = "missed"
                stats["blocks_auto_missed"] += 1
                modified = True

        if modified:
            await plans_repo.update(
                plan_id,
                {"micro_blocks": plan_doc["micro_blocks"]},
                id_field="plan_id",
            )

    # --- B3: Auto-complete goals ---
    for goal_doc in all_goals:
        if goal_doc.get("status") != GoalStatus.ACTIVE.value:
            continue

        # Check if goal has knowledge with estimated hours
        knowledge_doc = await knowledge_repo.find_by_id(
            goal_doc["goal_id"], id_field="goal_id"
        )
        if not knowledge_doc:
            continue

        total_est_hours = float(knowledge_doc.get("estimated_total_hours", 0) or 0)
        if total_est_hours <= 0:
            continue

        # Sum done minutes from the active plan
        plan_id = goal_doc.get("active_plan_id")
        if not plan_id:
            continue

        plan_doc = await plans_repo.find_by_id(plan_id, id_field="plan_id")
        if not plan_doc:
            continue

        done_minutes = 0
        for block in plan_doc.get("micro_blocks", []):
            status = block.get("status", "scheduled")
            dur = int(block.get("duration_min", 0) or 0)
            if status == "done":
                done_minutes += dur
            elif status == "partial":
                done_minutes += dur // 2

        completion_pct = (done_minutes / (total_est_hours * 60)) * 100
        if completion_pct >= 100.0:
            await goals_repo.update(goal_doc["goal_id"], {
                "status": GoalStatus.COMPLETED.value,
                "completed_at": now.isoformat(),
            })
            stats["goals_auto_completed"] += 1
            logger.info(
                "Auto-completed goal %s (%.1f%% done)",
                goal_doc["goal_id"], completion_pct,
            )

    # --- B1: Rolling replan ---
    active_goals = [
        g for g in all_goals
        if g.get("status") == GoalStatus.ACTIVE.value
    ]
    if active_goals:
        try:
            plans = await replan_all_goals(user_id, window_days=window_days)
            stats["plans_regenerated"] = len(plans)
        except Exception:
            logger.exception("Rolling replan failed for user %s", user_id)

    logger.info("Sweep completed for user %s: %s", user_id, stats)
    return stats


async def sweep_all_users(window_days: int = 7) -> list[dict]:
    """Run the daily sweep for ALL users in the system.

    Call this from a cron job or scheduler:
        python -c "import asyncio; from agents.planner.sweeper import sweep_all_users; asyncio.run(sweep_all_users())"
    """
    # Get all distinct user_ids from goals collection
    all_goals = await goals_repo.find_many({}, limit=10000)
    user_ids = list({g["user_id"] for g in all_goals if g.get("user_id")})

    results = []
    for user_id in user_ids:
        try:
            stats = await sweep_user(user_id, window_days=window_days)
            results.append({"user_id": user_id, **stats})
        except Exception:
            logger.exception("Sweep failed for user %s", user_id)
            results.append({"user_id": user_id, "error": True})

    logger.info("Global sweep completed: %d users processed", len(results))
    return results
