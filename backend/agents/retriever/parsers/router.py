"""Unified material parser — routes files and URLs to specialized parsers."""

import logging
from shared.models.knowledge import ResourceRef
from agents.retriever.parsers.pdf_parser import parse_pdf
from agents.retriever.parsers.html_parser import parse_html
from agents.retriever.parsers.youtube_parser import parse_youtube
from agents.retriever.parsers.github_parser import parse_github
from agents.retriever.parsers.text_parser import parse_text_file

logger = logging.getLogger(__name__)


async def parse_all_materials(
    file_ids: list[str],
    urls: list[str],
) -> tuple[list[str], list[ResourceRef]]:
    """Parse all uploaded files and URLs. Returns (texts, resource_refs)."""
    texts: list[str] = []
    refs: list[ResourceRef] = []

    # Parse uploaded files
    for file_id in file_ids:
        try:
            if file_id.lower().endswith(".pdf"):
                text = await parse_pdf(file_id)
                source_type = "pdf"
            else:
                text = await parse_text_file(file_id)
                source_type = "text"

            texts.append(text)
            refs.append(ResourceRef(
                title=file_id.split("/")[-1],
                file_id=file_id,
                source_type=source_type,
            ))
        except Exception as e:
            logger.warning("Failed to parse file %s: %s", file_id, e)

    # Parse URLs
    for url in urls:
        try:
            if "youtube.com" in url or "youtu.be" in url:
                text, ref = await parse_youtube(url)
            elif "github.com" in url:
                text, ref = await parse_github(url)
            else:
                text, ref = await parse_html(url)

            texts.append(text)
            refs.append(ref)
        except Exception as e:
            logger.warning("Failed to parse URL %s: %s", url, e)

    return texts, refs
