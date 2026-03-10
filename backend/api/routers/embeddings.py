"""Embeddings visualization endpoint — returns 3D-reduced topic embeddings."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query

import numpy as np
from sklearn.decomposition import PCA

from api.dependencies import get_current_user_id
from shared.db.repositories import goals_repo, knowledge_repo
from shared.models import GoalKnowledge
from agents.retriever.embeddings import embed_texts, compute_similarity

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/goal/{goal_id}")
async def get_goal_embeddings(
    goal_id: str,
    dims: int = Query(default=3, ge=2, le=3),
    user_id: str = Depends(get_current_user_id),
):
    """Return 2D or 3D reduced embeddings for a goal's topics."""
    goal_doc = await goals_repo.find_by_id(goal_id)
    if not goal_doc or goal_doc.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Goal not found")

    knowledge_doc = await knowledge_repo.find_by_id(goal_id, id_field="goal_id")
    if not knowledge_doc:
        raise HTTPException(status_code=404, detail="No knowledge found for this goal")

    knowledge = GoalKnowledge(**knowledge_doc)
    if len(knowledge.topics) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 topics for visualization")

    texts = [f"{t.title}. {t.description}" for t in knowledge.topics]
    raw_embeddings = embed_texts(texts)

    sim_matrix = compute_similarity(raw_embeddings)

    n_components = min(dims, len(texts))
    pca = PCA(n_components=n_components)
    reduced = pca.fit_transform(raw_embeddings)

    # Normalize to [-1, 1] range for visualization
    for axis in range(n_components):
        col = reduced[:, axis]
        rng = col.max() - col.min()
        if rng > 0:
            reduced[:, axis] = 2 * (col - col.min()) / rng - 1

    points = []
    for i, topic in enumerate(knowledge.topics):
        coords = reduced[i].tolist()
        # Find top-3 similar topics (excluding self)
        sim_row = sim_matrix[i].copy()
        sim_row[i] = -1
        top_indices = np.argsort(sim_row)[-3:][::-1]
        neighbors = [
            {"topic_id": knowledge.topics[j].topic_id, "similarity": round(float(sim_matrix[i][j]), 3)}
            for j in top_indices
            if sim_matrix[i][j] > 0.3
        ]

        points.append({
            "topic_id": topic.topic_id,
            "title": topic.title,
            "description": topic.description,
            "est_hours": topic.est_hours,
            "prereq_ids": topic.prereq_ids,
            "x": round(coords[0], 4),
            "y": round(coords[1], 4),
            "z": round(coords[2], 4) if n_components >= 3 else 0.0,
            "neighbors": neighbors,
        })

    # Build edges: prereq relationships + high-similarity pairs
    edges = []
    topic_ids = {t.topic_id for t in knowledge.topics}
    for topic in knowledge.topics:
        for prereq_id in topic.prereq_ids:
            if prereq_id in topic_ids:
                edges.append({"from": prereq_id, "to": topic.topic_id, "type": "prereq"})

    # Add similarity edges for pairs above threshold
    for i in range(len(knowledge.topics)):
        for j in range(i + 1, len(knowledge.topics)):
            if sim_matrix[i][j] > 0.7:
                edges.append({
                    "from": knowledge.topics[i].topic_id,
                    "to": knowledge.topics[j].topic_id,
                    "type": "similar",
                    "weight": round(float(sim_matrix[i][j]), 3),
                })

    return {
        "goal_id": goal_id,
        "goal_title": goal_doc.get("title", ""),
        "dimensions": n_components,
        "variance_explained": round(float(pca.explained_variance_ratio_.sum()), 3),
        "points": points,
        "edges": edges,
        "total_topics": len(knowledge.topics),
        "embedding_model": "all-MiniLM-L6-v2",
        "original_dims": int(raw_embeddings.shape[1]),
    }


@router.get("/all")
async def get_all_embeddings(
    dims: int = Query(default=3, ge=2, le=3),
    user_id: str = Depends(get_current_user_id),
):
    """Return combined embeddings across ALL goals for the user."""
    all_goals = await goals_repo.find_many({"user_id": user_id})
    if not all_goals:
        raise HTTPException(status_code=404, detail="No goals found")

    all_texts = []
    all_meta = []

    for goal in all_goals:
        k_doc = await knowledge_repo.find_by_id(goal["goal_id"], id_field="goal_id")
        if not k_doc:
            continue
        knowledge = GoalKnowledge(**k_doc)
        for topic in knowledge.topics:
            all_texts.append(f"{topic.title}. {topic.description}")
            all_meta.append({
                "topic_id": topic.topic_id,
                "title": topic.title,
                "description": topic.description,
                "est_hours": topic.est_hours,
                "prereq_ids": topic.prereq_ids,
                "goal_id": goal["goal_id"],
                "goal_title": goal.get("title", ""),
            })

    if len(all_texts) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 topics across all goals")

    raw_embeddings = embed_texts(all_texts)
    sim_matrix = compute_similarity(raw_embeddings)

    n_components = min(dims, len(all_texts))
    pca = PCA(n_components=n_components)
    reduced = pca.fit_transform(raw_embeddings)

    for axis in range(n_components):
        col = reduced[:, axis]
        rng = col.max() - col.min()
        if rng > 0:
            reduced[:, axis] = 2 * (col - col.min()) / rng - 1

    points = []
    for i, meta in enumerate(all_meta):
        coords = reduced[i].tolist()
        sim_row = sim_matrix[i].copy()
        sim_row[i] = -1
        top_indices = np.argsort(sim_row)[-3:][::-1]
        neighbors = [
            {"topic_id": all_meta[j]["topic_id"], "similarity": round(float(sim_matrix[i][j]), 3)}
            for j in top_indices
            if sim_matrix[i][j] > 0.3
        ]
        points.append({
            **meta,
            "x": round(coords[0], 4),
            "y": round(coords[1], 4),
            "z": round(coords[2], 4) if n_components >= 3 else 0.0,
            "neighbors": neighbors,
        })

    # Edges
    edges = []
    topic_id_set = {m["topic_id"] for m in all_meta}
    for meta in all_meta:
        for prereq_id in meta["prereq_ids"]:
            if prereq_id in topic_id_set:
                edges.append({"from": prereq_id, "to": meta["topic_id"], "type": "prereq"})
    for i in range(len(all_meta)):
        for j in range(i + 1, len(all_meta)):
            if sim_matrix[i][j] > 0.7:
                edges.append({
                    "from": all_meta[i]["topic_id"],
                    "to": all_meta[j]["topic_id"],
                    "type": "similar",
                    "weight": round(float(sim_matrix[i][j]), 3),
                })

    return {
        "dimensions": n_components,
        "variance_explained": round(float(pca.explained_variance_ratio_.sum()), 3),
        "points": points,
        "edges": edges,
        "total_topics": len(all_texts),
        "goals_count": len(all_goals),
        "embedding_model": "all-MiniLM-L6-v2",
        "original_dims": int(raw_embeddings.shape[1]),
    }
