"""Executor agent worker — listens on Service Bus and processes jobs."""

import asyncio
import logging

from shared.config import get_settings
from shared.bus.service_bus import listen
from shared.telemetry.tracing import init_tracing
from agents.executor.agent import run_executor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def handle_message(body: dict) -> None:
    plan_id = body["plan_id"]
    user_id = body["user_id"]
    action = body.get("action", "sync_calendar")
    logger.info("Executor job received: plan_id=%s action=%s", plan_id, action)

    try:
        result = await run_executor(plan_id, user_id, action)
        logger.info("Executor completed: %s", result)
    except Exception as e:
        logger.exception("Executor failed for plan %s: %s", plan_id, e)


async def main():
    settings = get_settings()
    init_tracing("vantage-executor")
    logger.info("Executor worker starting...")
    await listen(settings.service_bus_queue_executor, handle_message)


if __name__ == "__main__":
    asyncio.run(main())
