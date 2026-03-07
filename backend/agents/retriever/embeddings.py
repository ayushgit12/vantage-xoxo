"""Local SentenceTransformers embeddings for semantic operations.

Used by the Retriever for:
- Semantic chunking (group related paragraphs)
- Topic clustering (identify distinct topics from chunks)
- Similarity scoring (find related content)
"""

import logging
import numpy as np
from functools import lru_cache
from sentence_transformers import SentenceTransformer

from shared.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    settings = get_settings()
    model_name = settings.embedding_model
    logger.info("Loading SentenceTransformer model: %s", model_name)
    return SentenceTransformer(model_name)


def embed_texts(texts: list[str]) -> np.ndarray:
    """Embed a list of texts into vectors."""
    model = _get_model()
    return model.encode(texts, show_progress_bar=False, convert_to_numpy=True)


def compute_similarity(embeddings: np.ndarray) -> np.ndarray:
    """Compute cosine similarity matrix."""
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    normalized = embeddings / norms
    return normalized @ normalized.T


def cluster_chunks(chunks: list[str], threshold: float = 0.65) -> list[list[int]]:
    """Cluster chunk indices by semantic similarity using greedy grouping.

    Returns list of clusters, each containing chunk indices.
    """
    if len(chunks) <= 1:
        return [list(range(len(chunks)))]

    embeddings = embed_texts(chunks)
    sim_matrix = compute_similarity(embeddings)

    assigned = set()
    clusters: list[list[int]] = []

    for i in range(len(chunks)):
        if i in assigned:
            continue
        cluster = [i]
        assigned.add(i)
        for j in range(i + 1, len(chunks)):
            if j not in assigned and sim_matrix[i][j] >= threshold:
                cluster.append(j)
                assigned.add(j)
        clusters.append(cluster)

    return clusters


def find_topic_labels(chunks: list[str], clusters: list[list[int]]) -> list[str]:
    """Pick the most representative chunk from each cluster as a label hint."""
    labels = []
    embeddings = embed_texts(chunks)

    for cluster_indices in clusters:
        if len(cluster_indices) == 1:
            # Use first line of the chunk as label
            text = chunks[cluster_indices[0]].strip().split("\n")[0][:100]
            labels.append(text)
        else:
            # Pick the chunk closest to cluster centroid
            cluster_vecs = embeddings[cluster_indices]
            centroid = cluster_vecs.mean(axis=0)
            distances = np.linalg.norm(cluster_vecs - centroid, axis=1)
            best_idx = cluster_indices[int(np.argmin(distances))]
            text = chunks[best_idx].strip().split("\n")[0][:100]
            labels.append(text)

    return labels
