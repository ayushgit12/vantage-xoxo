"""YouTube metadata and transcript parser."""

import html
import logging
import re
import tempfile
from pathlib import Path

import httpx
import yt_dlp

from shared.models.knowledge import ResourceRef

logger = logging.getLogger(__name__)


def _extract_video_id(url: str) -> str | None:
    patterns = [
        r"(?:v=|/v/|youtu\.be/|/shorts/|/embed/|/live/)([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def _clean_caption_text(raw_caption: str) -> str:
    """Convert VTT/SRT-like caption content into plain transcript text."""
    lines: list[str] = []
    prev = ""

    for raw_line in raw_caption.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        # Remove common caption metadata and timing/index lines
        if line in {"WEBVTT", "NOTE"}:
            continue
        if line.isdigit():
            continue
        if "-->" in line:
            continue
        if line.startswith("Kind:") or line.startswith("Language:"):
            continue

        # Strip inline markup like <c>, <i>, <v Speaker>
        line = re.sub(r"<[^>]+>", "", line)
        line = html.unescape(line)
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue

        # Captions often repeat consecutive lines between overlapping cues
        if line == prev:
            continue
        prev = line
        lines.append(line)

    return " ".join(lines)


def _fetch_captions_with_ytdlp(video_id: str) -> str | None:
    """Fetch YouTube captions with yt-dlp and return cleaned transcript text."""
    video_url = f"https://www.youtube.com/watch?v={video_id}"

    with tempfile.TemporaryDirectory(prefix="yt_captions_") as temp_dir:
        outtmpl = str(Path(temp_dir) / "%(id)s.%(ext)s")
        ydl_opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["en.*", "en"],
            "subtitlesformat": "vtt/srt/best",
            "outtmpl": outtmpl,
            "quiet": True,
            "no_warnings": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(video_url, download=True)
        except Exception as e:
            logger.warning("yt-dlp caption download failed for %s: %s", video_id, e)
            return None

        caption_files = sorted(Path(temp_dir).glob(f"{video_id}*.vtt"))
        if not caption_files:
            caption_files = sorted(Path(temp_dir).glob(f"{video_id}*.srt"))

        for caption_path in caption_files:
            try:
                raw_caption = caption_path.read_text(encoding="utf-8", errors="ignore")
                cleaned = _clean_caption_text(raw_caption)
                if cleaned:
                    return cleaned
            except Exception as e:
                logger.warning("Failed to parse caption file %s: %s", caption_path, e)

    return None


def _fetch_transcript(video_id: str) -> str | None:
    """Fetch transcript text using yt-dlp captions."""
    try:
        return _fetch_captions_with_ytdlp(video_id)
    except Exception as e:
        logger.warning("Could not fetch transcript for %s via yt-dlp: %s", video_id, e)
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
