"""Retriever agent worker — listens on Service Bus and processes jobs."""

import asyncio
import logging

from shared.config import get_settings
from shared.bus.service_bus import listen
from shared.telemetry.tracing import init_tracing
from agents.retriever.agent import run_retriever

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def handle_message(body: dict) -> None:
    goal_id = body["goal_id"]
    user_id = body["user_id"]
    logger.info("Retriever job received: goal_id=%s", goal_id)

    try:
        knowledge = await run_retriever(goal_id, user_id)
        logger.info(
            "Retriever completed: %d topics, %.1fh",
            len(knowledge.topics),
            knowledge.estimated_total_hours,
        )
    except Exception as e:
        logger.exception("Retriever failed for goal %s: %s", goal_id, e)


async def main():
    settings = get_settings()
    init_tracing("vantage-retriever")
    logger.info("Retriever worker starting...")
    await listen(settings.service_bus_queue_retriever, handle_message)


if __name__ == "__main__":
    asyncio.run(main())
