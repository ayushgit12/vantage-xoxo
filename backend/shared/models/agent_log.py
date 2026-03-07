from datetime import datetime, timezone
from pydantic import BaseModel, Field
from uuid import uuid4


class AgentLog(BaseModel):
    log_id: str = Field(default_factory=lambda: str(uuid4()))
    agent_name: str  # "retriever", "planner", "executor"
    trace_id: str = Field(default_factory=lambda: str(uuid4()))
    input_hash: str = ""
    output_hash: str = ""
    prompt_version_id: str | None = None  # only if LLM was used
    decision_summary: str = ""
    duration_ms: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
