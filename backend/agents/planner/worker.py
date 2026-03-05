"""Planner agent worker — listens on Service Bus and processes jobs."""

import asyncio
import logging

from shared.config import get_settings
from shared.bus.service_bus import listen
from shared.telemetry.tracing import init_tracing
from agents.planner.agent import run_planner

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def handle_message(body: dict) -> None:
    goal_id = body["goal_id"]
    user_id = body["user_id"]
    window_days = body.get("window_days", 7)
    replan = body.get("replan", False)
    trigger_block_id = body.get("trigger_block_id")

    logger.info("Planner job received: goal_id=%s replan=%s", goal_id, replan)

    try:
        plan = await run_planner(
            goal_id=goal_id,
            user_id=user_id,
            window_days=window_days,
            replan=replan,
            trigger_block_id=trigger_block_id,
        )
        logger.info("Planner completed: %d blocks", len(plan.micro_blocks))
    except Exception as e:
        logger.exception("Planner failed for goal %s: %s", goal_id, e)


async def main():
    settings = get_settings()
    init_tracing("vantage-planner")
    logger.info("Planner worker starting...")
    await listen(settings.service_bus_queue_planner, handle_message)


if __name__ == "__main__":
    asyncio.run(main())
