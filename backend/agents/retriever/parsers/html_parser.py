"""HTML page parser using BeautifulSoup."""

import logging
import httpx
from bs4 import BeautifulSoup

from shared.models.knowledge import ResourceRef

logger = logging.getLogger(__name__)


async def parse_html(url: str) -> tuple[str, ResourceRef]:
    """Fetch a URL and extract readable text."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove script/style elements
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    title = soup.title.string if soup.title else url
    text = soup.get_text(separator="\n", strip=True)

    # Truncate very long pages
    if len(text) > 50_000:
        text = text[:50_000]

    ref = ResourceRef(
        title=str(title),
        url=url,
        source_type="url",
        description=f"Web page: {title}",
    )

    logger.info("Parsed HTML %s: %d chars", url, len(text))
    return text, ref
