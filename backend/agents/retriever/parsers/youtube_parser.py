"""YouTube metadata and transcript parser."""

import logging
import re
import httpx

from shared.models.knowledge import ResourceRef

logger = logging.getLogger(__name__)


def _extract_video_id(url: str) -> str | None:
    patterns = [
        r"(?:v=|/v/|youtu\.be/)([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def parse_youtube(url: str) -> tuple[str, ResourceRef]:
    """Extract metadata from a YouTube URL.

    For MVP: uses oEmbed API for title/description.
    For playlists: extracts playlist info.
    Full transcript extraction could use yt-dlp but is heavy.
    """
    video_id = _extract_video_id(url)

    # Use oEmbed for basic metadata
    oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(oembed_url)
        if resp.status_code == 200:
            data = resp.json()
            title = data.get("title", url)
            author = data.get("author_name", "")
        else:
            title = url
            author = ""

    # Build a summary text (for topic extraction)
    text = f"YouTube Video: {title}\nAuthor: {author}\nURL: {url}\n"

    # Estimate duration heuristic: average YouTube tutorial ≈ 15 min
    text += "\n[Video content — estimated 15-30 minutes per video]"

    ref = ResourceRef(
        title=title,
        url=url,
        source_type="youtube",
        description=f"YouTube: {title} by {author}",
    )

    logger.info("Parsed YouTube %s: %s", url, title)
    return text, ref
