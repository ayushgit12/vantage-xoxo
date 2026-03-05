"""Text chunker for LLM processing.

Splits raw texts into manageable chunks for topic extraction.
Uses simple paragraph-based splitting with overlap.
"""


def chunk_text(
    raw_texts: list[str],
    max_chunk_size: int = 3000,
    overlap: int = 200,
) -> list[str]:
    """Combine all texts and split into overlapping chunks."""
    combined = "\n\n---\n\n".join(raw_texts)

    if len(combined) <= max_chunk_size:
        return [combined]

    chunks: list[str] = []
    start = 0
    while start < len(combined):
        end = start + max_chunk_size

        # Try to break at paragraph boundary
        if end < len(combined):
            # Look for a paragraph break near the end
            break_point = combined.rfind("\n\n", start + max_chunk_size // 2, end)
            if break_point > start:
                end = break_point

        chunks.append(combined[start:end].strip())
        start = end - overlap

    return chunks
