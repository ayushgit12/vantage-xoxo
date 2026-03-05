"""Rule-based hour estimation for topics.

NO LLM here — pure heuristics based on content volume.
"""

import logging
import re

logger = logging.getLogger(__name__)

# Heuristic constants
CHARS_PER_HOUR_READING = 30_000   # ~10 pages of text per hour
VIDEO_MINUTES_PER_HOUR = 45       # watching + pausing + notes
EXERCISE_MULTIPLIER = 1.5         # practice takes 1.5x reading time
MIN_HOURS_PER_TOPIC = 0.5
MAX_HOURS_PER_TOPIC = 20.0


def estimate_hours(
    topics: list[dict],
    raw_texts: list[str],
) -> list[dict]:
    """Add est_hours to each topic based on content heuristics."""
    total_chars = sum(len(t) for t in raw_texts)
    total_reading_hours = max(total_chars / CHARS_PER_HOUR_READING, 1.0)

    num_topics = max(len(topics), 1)

    # Count video references in text
    combined = "\n".join(raw_texts).lower()
    video_mentions = len(re.findall(r"youtube|video|watch|lecture|recording", combined))
    video_hours = video_mentions * 0.5  # ~30 min per video reference

    # Base hours per topic: distribute total reading + video time
    base_per_topic = (total_reading_hours + video_hours) / num_topics

    for topic in topics:
        # Start with base allocation
        hours = base_per_topic

        title_lower = topic.get("title", "").lower()

        # Adjust for topic complexity keywords
        if any(kw in title_lower for kw in ["project", "build", "implement", "lab", "exercise"]):
            hours *= EXERCISE_MULTIPLIER
        elif any(kw in title_lower for kw in ["intro", "overview", "review", "summary"]):
            hours *= 0.6
        elif any(kw in title_lower for kw in ["advanced", "deep dive", "optimization"]):
            hours *= 1.3

        # Clamp
        hours = max(MIN_HOURS_PER_TOPIC, min(hours, MAX_HOURS_PER_TOPIC))
        topic["est_hours"] = round(hours, 1)

    logger.info(
        "Estimated hours for %d topics: %.1fh total",
        len(topics),
        sum(t.get("est_hours", 0) for t in topics),
    )
    return topics
