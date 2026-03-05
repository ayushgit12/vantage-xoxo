"""Web supplementation — fetch up to 3 trusted resources if confidence is low."""

import logging
import httpx

from shared.models.knowledge import ResourceRef
from shared.config import get_settings
from shared.cache.cache import get_cached, set_cached

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.6
MAX_SUPPLEMENTS = 3


async def supplement_if_needed(
    topics: list[dict],
    goal_title: str,
    confidence: float,
) -> tuple[list[dict], list[ResourceRef]]:
    """If confidence is below threshold, search for supplementary resources."""
    extra_refs: list[ResourceRef] = []

    if confidence >= CONFIDENCE_THRESHOLD:
        logger.info("Confidence %.2f >= threshold, skipping web supplement", confidence)
        return topics, extra_refs

    logger.info("Confidence %.2f < threshold, searching for supplements", confidence)

    # Use a simple web search (Bing Search API or fallback)
    settings = get_settings()

    # For MVP: construct useful reference URLs based on topics
    # In production: use Bing Search API with Azure credits
    topic_titles = [t.get("title", "") for t in topics[:5]]
    search_queries = [f"{goal_title} {title} tutorial" for title in topic_titles]

    for i, query in enumerate(search_queries[:MAX_SUPPLEMENTS]):
        ref = ResourceRef(
            title=f"Supplementary: {query}",
            url=None,  # Populated when actual search is implemented
            source_type="web_supplement",
            description=f"Auto-suggested resource for: {query}",
        )
        extra_refs.append(ref)

    logger.info("Added %d supplementary resource suggestions", len(extra_refs))
    return topics, extra_refs
