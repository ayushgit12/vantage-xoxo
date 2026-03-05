"""Block status tracker — manages per-block status transitions."""

import logging
from shared.models import MicroBlock, BlockStatus

logger = logging.getLogger(__name__)

VALID_TRANSITIONS = {
    BlockStatus.SCHEDULED: {BlockStatus.DONE, BlockStatus.PARTIAL, BlockStatus.MISSED, BlockStatus.CANCELLED},
    BlockStatus.PARTIAL: {BlockStatus.DONE, BlockStatus.MISSED},
    BlockStatus.MISSED: {BlockStatus.SCHEDULED},  # reschedule allowed
    BlockStatus.DONE: set(),  # terminal
    BlockStatus.CANCELLED: set(),  # terminal
}


def validate_status_transition(current: BlockStatus, new: BlockStatus) -> bool:
    """Check if a status transition is valid."""
    allowed = VALID_TRANSITIONS.get(current, set())
    return new in allowed
