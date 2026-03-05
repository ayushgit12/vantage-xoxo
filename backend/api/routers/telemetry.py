"""Telemetry / trace retrieval endpoint."""

from fastapi import APIRouter, HTTPException

from shared.db.repositories import logs_repo

router = APIRouter()


@router.get("/trace/{trace_id}")
async def get_trace(trace_id: str):
    """Retrieve all agent logs for a given trace."""
    docs = await logs_repo.find_many({"trace_id": trace_id})
    if not docs:
        raise HTTPException(status_code=404, detail="Trace not found")
    return {"trace_id": trace_id, "entries": docs}
