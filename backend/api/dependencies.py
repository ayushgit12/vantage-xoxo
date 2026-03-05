"""Shared FastAPI dependencies: auth, database injection."""

from fastapi import Depends, HTTPException, Header
from shared.config import get_settings


async def get_current_user_id(
    x_user_id: str = Header(default="demo-user-001"),
) -> str:
    """Extract user ID from header.

    MVP: accept a header value directly.
    Production: validate Azure AD JWT and extract oid claim.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user identity")
    return x_user_id
