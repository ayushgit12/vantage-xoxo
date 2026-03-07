"""YouTube metadata and transcript parser."""

import logging
import re
import httpx

from youtube_transcript_api import YouTubeTranscriptApi
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


def _fetch_transcript(video_id: str) -> str | None:
    """Fetch transcript text using youtube-transcript-api."""
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=["en", "en-US", "en-GB"])
        lines = [snippet.text for snippet in transcript.snippets]
        return " ".join(lines)
    except Exception as e:
        logger.warning("Could not fetch transcript for %s: %s", video_id, e)
        return None


async def parse_youtube(url: str) -> tuple[str, ResourceRef]:
    """Extract metadata and transcript from a YouTube URL."""
    video_id = _extract_video_id(url)

    # Use oEmbed for basic metadata
    title = url
    author = ""
    oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(oembed_url)
        if resp.status_code == 200:
            data = resp.json()
            title = data.get("title", url)
            author = data.get("author_name", "")

    # Fetch actual transcript
    transcript_text = None
    if video_id:
        transcript_text = _fetch_transcript(video_id)

    # Build text for topic extraction
    parts = [f"YouTube Video: {title}", f"Author: {author}", f"URL: {url}"]
    if transcript_text:
        # Limit transcript to ~15k chars to avoid overwhelming the chunker
        parts.append(f"\nTranscript:\n{transcript_text[:15000]}")
        logger.info("Fetched transcript for %s (%d chars)", video_id, len(transcript_text))
    else:
        parts.append("\n[No transcript available — content inferred from title]")

    text = "\n".join(parts)

    ref = ResourceRef(
        title=title,
        url=url,
        source_type="youtube",
        description=f"YouTube: {title} by {author}",
        transcript=transcript_text[:10000] if transcript_text else "",
    )

    logger.info("Parsed YouTube %s: %s", url, title)
    return text, ref
