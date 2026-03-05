"""GitHub repository parser — extracts README and structure."""

import logging
import re
import httpx

from shared.models.knowledge import ResourceRef

logger = logging.getLogger(__name__)


def _parse_github_url(url: str) -> tuple[str, str] | None:
    """Extract owner/repo from GitHub URL."""
    match = re.match(r"https?://github\.com/([^/]+)/([^/]+)", url)
    if match:
        return match.group(1), match.group(2)
    return None


async def parse_github(url: str) -> tuple[str, ResourceRef]:
    """Fetch README and repo metadata from GitHub API."""
    parsed = _parse_github_url(url)
    if not parsed:
        raise ValueError(f"Cannot parse GitHub URL: {url}")

    owner, repo = parsed
    repo_name = repo.rstrip(".git")

    async with httpx.AsyncClient(timeout=15) as client:
        # Get README
        readme_url = f"https://api.github.com/repos/{owner}/{repo_name}/readme"
        resp = await client.get(
            readme_url,
            headers={"Accept": "application/vnd.github.raw+json"},
        )
        if resp.status_code == 200:
            readme_text = resp.text
        else:
            readme_text = f"[Could not fetch README for {owner}/{repo_name}]"

        # Get repo metadata
        repo_url = f"https://api.github.com/repos/{owner}/{repo_name}"
        resp = await client.get(repo_url)
        if resp.status_code == 200:
            meta = resp.json()
            description = meta.get("description", "")
            language = meta.get("language", "")
            topics = meta.get("topics", [])
        else:
            description = ""
            language = ""
            topics = []

    text = f"GitHub Repository: {owner}/{repo_name}\n"
    text += f"Description: {description}\n"
    text += f"Language: {language}\n"
    text += f"Topics: {', '.join(topics)}\n\n"
    text += f"README:\n{readme_text}\n"

    ref = ResourceRef(
        title=f"{owner}/{repo_name}",
        url=url,
        source_type="github",
        description=f"GitHub: {description}" if description else f"GitHub: {owner}/{repo_name}",
    )

    logger.info("Parsed GitHub %s/%s: %d chars", owner, repo_name, len(text))
    return text, ref
