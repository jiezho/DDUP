import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import audit, get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.space import Space, SpaceMember


router = APIRouter(prefix="/spaces", tags=["spaces"])


class SpaceOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    owner_user_id: str


class SpaceCreateIn(BaseModel):
    name: str
    type: str = "project"


class SpaceMemberAddIn(BaseModel):
    user_id: str
    role: str = "member"


@router.get("", response_model=list[SpaceOut])
def list_spaces(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    _current_space: Space = Depends(get_current_space),
) -> list[SpaceOut]:
    stmt = (
        select(Space)
        .join(SpaceMember, SpaceMember.space_id == Space.id)
        .where(SpaceMember.user_id == user_id)
        .order_by(Space.created_at.desc())
    )
    spaces = list(db.scalars(stmt).all())
    return [SpaceOut(id=s.id, name=s.name, type=s.type, owner_user_id=s.owner_user_id) for s in spaces]


@router.post("", response_model=SpaceOut)
def create_space(
    body: SpaceCreateIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    current_space: Space = Depends(get_current_space),
) -> SpaceOut:
    space = Space(name=body.name, type=body.type, owner_user_id=user_id)
    db.add(space)
    db.flush()
    db.add(SpaceMember(space_id=space.id, user_id=user_id, role="owner"))
    db.commit()
    db.refresh(space)

    audit("space.create", db, current_space.id, user_id, resource_type="space", resource_id=str(space.id))
    return SpaceOut(id=space.id, name=space.name, type=space.type, owner_user_id=space.owner_user_id)


@router.post("/{space_id}/members")
def add_member(
    space_id: uuid.UUID,
    body: SpaceMemberAddIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    current_space: Space = Depends(get_current_space),
) -> dict:
    space = db.get(Space, space_id)
    if not space:
        raise HTTPException(status_code=404, detail="space not found")

    owner = db.scalar(select(SpaceMember).where(SpaceMember.space_id == space.id, SpaceMember.user_id == user_id))
    if not owner or owner.role != "owner":
        raise HTTPException(status_code=403, detail="only owner can add members")

    existing = db.scalar(select(SpaceMember).where(SpaceMember.space_id == space.id, SpaceMember.user_id == body.user_id))
    if existing:
        raise HTTPException(status_code=409, detail="member already exists")

    db.add(SpaceMember(space_id=space.id, user_id=body.user_id, role=body.role))
    db.commit()

    audit(
        "space.add_member",
        db,
        current_space.id,
        user_id,
        resource_type="space",
        resource_id=str(space.id),
        payload={"member_user_id": body.user_id, "role": body.role},
    )
    return {"status": "ok"}

