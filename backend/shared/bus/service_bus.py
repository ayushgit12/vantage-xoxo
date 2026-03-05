"""Azure Service Bus helpers for agent-to-agent messaging.

In local dev (no Service Bus connection string), falls back to
an in-process asyncio queue so docker-compose works without Azure.
"""

import asyncio
import json
import logging
from typing import Any, Callable, Awaitable

from shared.config import get_settings

logger = logging.getLogger(__name__)

# ─── In-process fallback queues for local dev ───
_local_queues: dict[str, asyncio.Queue] = {}


def _get_local_queue(name: str) -> asyncio.Queue:
    if name not in _local_queues:
        _local_queues[name] = asyncio.Queue()
    return _local_queues[name]


async def send_message(queue_name: str, body: dict[str, Any]) -> None:
    settings = get_settings()
    if settings.service_bus_connection_string:
        from azure.servicebus.aio import ServiceBusClient, ServiceBusMessage

        async with ServiceBusClient.from_connection_string(
            settings.service_bus_connection_string
        ) as client:
            async with client.get_queue_sender(queue_name) as sender:
                msg = ServiceBusMessage(json.dumps(body))
                await sender.send_messages(msg)
                logger.info("Sent message to Service Bus queue %s", queue_name)
    else:
        q = _get_local_queue(queue_name)
        await q.put(body)
        logger.info("Sent message to local queue %s", queue_name)


async def listen(queue_name: str, handler: Callable[[dict], Awaitable[None]]) -> None:
    """Block and process messages from a queue. Runs forever."""
    settings = get_settings()
    if settings.service_bus_connection_string:
        from azure.servicebus.aio import ServiceBusClient

        async with ServiceBusClient.from_connection_string(
            settings.service_bus_connection_string
        ) as client:
            async with client.get_queue_receiver(queue_name) as receiver:
                logger.info("Listening on Service Bus queue %s", queue_name)
                async for msg in receiver:
                    body = json.loads(str(msg))
                    await handler(body)
                    await receiver.complete_message(msg)
    else:
        q = _get_local_queue(queue_name)
        logger.info("Listening on local queue %s", queue_name)
        while True:
            body = await q.get()
            await handler(body)
