"""YouTube metadata and transcript parser."""

import html
import logging
import re
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import yt_dlp

from shared.models.knowledge import ResourceRef

logger = logging.getLogger(__name__)

MAX_SINGLE_VIDEO_TRANSCRIPT_CHARS = 15000
MAX_PLAYLIST_VIDEOS = 5
MAX_PLAYLIST_TRANSCRIPT_CHARS = 25000


def _extract_video_id(url: str) -> str | None:
    patterns = [
        r"(?:v=|/v/|youtu\.be/|/shorts/|/embed/|/live/)([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def _extract_playlist_id(url: str) -> str | None:
    """Extract a playlist id from a YouTube URL, if present."""
    parsed = urlparse(url)
    list_values = parse_qs(parsed.query).get("list")
    if list_values:
        playlist_id = list_values[0].strip()
        if playlist_id:
            return playlist_id
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


def _fetch_playlist_entries(url: str, max_videos: int = MAX_PLAYLIST_VIDEOS) -> tuple[str, list[dict[str, str]]]:
    """Return playlist title and a bounded list of video entries."""
    ydl_opts = {
        "skip_download": True,
        "extract_flat": "in_playlist",
        "playlistend": max_videos,
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        logger.warning("yt-dlp playlist extraction failed for %s: %s", url, e)
        return "", []

    playlist_title = (info or {}).get("title") or ""
    raw_entries = (info or {}).get("entries") or []
    entries: list[dict[str, str]] = []

    for raw_entry in raw_entries:
        if not raw_entry:
            continue
        video_id = (raw_entry.get("id") or "").strip()
        if not video_id:
            extracted = _extract_video_id(raw_entry.get("url") or "")
            if extracted:
                video_id = extracted
        if not video_id:
            continue
        entries.append({
            "id": video_id,
            "title": (raw_entry.get("title") or f"Video {len(entries) + 1}").strip(),
        })

    return playlist_title, entries


def _build_playlist_transcript(entries: list[dict[str, str]]) -> tuple[str | None, int]:
    """Fetch transcripts for playlist entries and concatenate them with section markers."""
    sections: list[str] = []
    total_chars = 0
    used_videos = 0

    for idx, entry in enumerate(entries, start=1):
        video_id = entry["id"]
        transcript = _fetch_transcript(video_id)
        if not transcript:
            continue

        header = f"[{idx}] {entry['title']} (https://www.youtube.com/watch?v={video_id})"
        available = MAX_PLAYLIST_TRANSCRIPT_CHARS - total_chars
        if available <= 0:
            break

        section_body = transcript[: max(0, available - len(header) - 4)]
        if not section_body:
            break

        sections.append(f"{header}\n{section_body}")
        total_chars += len(header) + 1 + len(section_body)
        used_videos += 1

    if not sections:
        return None, 0

    return "\n\n".join(sections), used_videos


async def parse_youtube(url: str) -> tuple[str, ResourceRef]:
    """Extract metadata and transcript from a YouTube URL."""
    playlist_id = _extract_playlist_id(url)
    if playlist_id:
        playlist_title, entries = _fetch_playlist_entries(url, max_videos=MAX_PLAYLIST_VIDEOS)
        transcript_text, used_videos = _build_playlist_transcript(entries)

        title = playlist_title or f"YouTube Playlist ({playlist_id})"
        parts = [f"YouTube Playlist: {title}", f"URL: {url}", f"Videos considered: {len(entries)}"]
        if transcript_text:
            parts.append(f"Videos with transcripts: {used_videos}")
            parts.append(f"\nTranscript:\n{transcript_text}")
            logger.info(
                "Fetched playlist transcript for %s (%d videos, %d chars)",
                playlist_id,
                used_videos,
                len(transcript_text),
            )
        else:
            parts.append("\n[No transcript available for videos in this playlist]")

        text = "\n".join(parts)
        ref = ResourceRef(
            title=title,
            url=url,
            source_type="youtube",
            description=f"YouTube Playlist: {title}",
            transcript=transcript_text[:10000] if transcript_text else "",
        )
        logger.info("Parsed YouTube playlist %s: %s", url, title)
        return text, ref

    video_id = _extract_video_id(url)

    # Use oEmbed for basic metadata
    title = url
    author = ""
    oembed_url = f"https://www.youtube.com/oembed?url={url}&format=json"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(oembed_url)
            if resp.status_code == 200:
                data = resp.json()
                title = data.get("title", url)
                author = data.get("author_name", "")
    except Exception as e:
        logger.warning("Failed to fetch YouTube oEmbed for %s: %s", url, e)

    # Fetch actual transcript
    transcript_text = None
    if video_id:
        transcript_text = _fetch_transcript(video_id)

    # Build text for topic extraction
    parts = [f"YouTube Video: {title}", f"Author: {author}", f"URL: {url}"]
    if transcript_text:
        # Limit transcript to avoid overwhelming the chunker
        parts.append(f"\nTranscript:\n{transcript_text[:MAX_SINGLE_VIDEO_TRANSCRIPT_CHARS]}")
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
