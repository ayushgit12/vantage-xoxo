"""PDF parser using PyMuPDF (fitz)."""

import logging
import io
import fitz  # PyMuPDF

from shared.config import get_settings

logger = logging.getLogger(__name__)


async def parse_pdf(file_id: str) -> str:
    """Download PDF from blob storage and extract text."""
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

    # Extract text from PDF
    doc = fitz.open(stream=io.BytesIO(data), filetype="pdf")
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()

    text = "\n\n".join(pages)
    logger.info("Parsed PDF %s: %d pages, %d chars", file_id, len(pages), len(text))
    return text
