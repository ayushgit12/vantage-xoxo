"""Web supplementation — fetch up to 3 trusted resources if confidence is low.

Uses DuckDuckGo HTML search as a lightweight, no-API-key fallback.
"""

import logging
import re
import httpx

from shared.models.knowledge import ResourceRef
from shared.config import get_settings
from shared.cache.cache import get_cached, set_cached

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.6
MAX_SUPPLEMENTS = 3
SEARCH_TIMEOUT = 8.0


async def _search_duckduckgo(query: str) -> list[dict]:
    """Search DuckDuckGo HTML and extract result URLs + titles."""
    results: list[dict] = []
    url = "https://html.duckduckgo.com/html/"
    try:
        async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT, follow_redirects=True) as client:
            resp = await client.post(url, data={"q": query})
            if resp.status_code != 200:
                logger.warning("DuckDuckGo returned %d for query: %s", resp.status_code, query)
                return results

            # Extract result links from the HTML
            # DuckDuckGo HTML results have class "result__a"
            links = re.findall(
                r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
                resp.text,
                re.DOTALL,
            )
            for href, title_html in links[:5]:
                # DuckDuckGo wraps URLs in a redirect; extract the actual URL
                actual_url = href
                uddg_match = re.search(r"uddg=([^&]+)", href)
                if uddg_match:
                    from urllib.parse import unquote
                    actual_url = unquote(uddg_match.group(1))

                clean_title = re.sub(r"<[^>]+>", "", title_html).strip()
                if actual_url and clean_title:
                    results.append({"url": actual_url, "title": clean_title})

    except Exception as e:
        logger.warning("DuckDuckGo search failed for '%s': %s", query, e)

    return results


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

    # Check cache first
    cache_key = {
        "op": "web_supplement",
        "goal_title": goal_title,
        "topics": [t.get("title", "") for t in topics[:5]],
    }
    cached = await get_cached(cache_key)
    if cached and isinstance(cached, list):
        for item in cached:
            extra_refs.append(ResourceRef(**item))
        logger.info("Using %d cached supplementary resources", len(extra_refs))
        return topics, extra_refs

    # Search for each topic
    topic_titles = [t.get("title", "") for t in topics[:5]]
    search_queries = [f"{goal_title} {title} tutorial" for title in topic_titles]

    for query in search_queries[:MAX_SUPPLEMENTS]:
        results = await _search_duckduckgo(query)
        if results:
            best = results[0]
            ref = ResourceRef(
                title=f"Supplementary: {best['title'][:80]}",
                url=best["url"],
                source_type="web_supplement",
                description=f"Auto-found resource for: {query}",
            )
            extra_refs.append(ref)

    # Cache the results
    if extra_refs:
        await set_cached(
            cache_key,
            [ref.model_dump(mode="json") for ref in extra_refs],
        )

    logger.info("Added %d supplementary resources with real URLs", len(extra_refs))
    return topics, extra_refs
