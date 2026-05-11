import uuid
from collections.abc import Generator

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.space import Space, SpaceMember


def get_current_user_id(x_user_id: str | None = Header(default=None)) -> str:
    return x_user_id or "dev-user"


def get_current_space(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    x_space_id: str | None = Header(default=None),
) -> Space:
    if x_space_id:
        try:
            space_uuid = uuid.UUID(x_space_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="invalid X-Space-Id") from e

        space = db.get(Space, space_uuid)
        if not space:
            raise HTTPException(status_code=404, detail="space not found")

        member = db.scalar(
            select(SpaceMember).where(SpaceMember.space_id == space.id, SpaceMember.user_id == user_id)
        )
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this space")
        return space

    personal = db.scalar(select(Space).where(Space.owner_user_id == user_id, Space.type == "personal"))
    if personal:
        return personal

    space = Space(name="个人空间", type="personal", owner_user_id=user_id)
    db.add(space)
    db.flush()
    db.add(SpaceMember(space_id=space.id, user_id=user_id, role="owner"))
    db.commit()
    db.refresh(space)
    return space


def audit(
    action: str,
    db: Session,
    space_id: uuid.UUID,
    user_id: str,
    resource_type: str = "",
    resource_id: str = "",
    payload: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            space_id=space_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            payload=payload or {},
        )
    )
    db.commit()

