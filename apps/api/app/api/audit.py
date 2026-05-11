import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.space import Space


router = APIRouter(prefix="/audit", tags=["audit"])


class AuditOut(BaseModel):
    id: uuid.UUID
    action: str
    resource_type: str
    resource_id: str
    created_at: str


@router.get("", response_model=list[AuditOut])
def list_audit(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[AuditOut]:
    stmt = (
        select(AuditLog)
        .where(AuditLog.space_id == space.id, AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(200)
    )
    logs = list(db.scalars(stmt).all())
    return [
        AuditOut(
            id=l.id,
            action=l.action,
            resource_type=l.resource_type,
            resource_id=l.resource_id,
            created_at=l.created_at.isoformat(),
        )
        for l in logs
    ]

