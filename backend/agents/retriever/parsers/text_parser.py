"""Plain text / markdown file parser."""

import logging
from shared.config import get_settings

logger = logging.getLogger(__name__)


async def parse_text_file(file_id: str) -> str:
    """Download a text/markdown file from blob storage."""
    settings = get_settings()

    from azure.storage.blob.aio import BlobServiceClient

    blob_client = BlobServiceClient.from_connection_string(
        settings.azure_storage_connection_string
    )
    container = blob_client.get_container_client(settings.azure_storage_container)
    blob = container.get_blob_client(file_id)

    stream = await blob.download_blob()
    data = await stream.readall()
    await blob_client.close()

    text = data.decode("utf-8", errors="replace")
    logger.info("Parsed text file %s: %d chars", file_id, len(text))
    return text
