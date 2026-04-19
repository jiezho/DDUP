import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import audit, get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.learning import LearningTerm
from app.models.space import Space


router = APIRouter(prefix="/learning", tags=["learning"])


class TermOut(BaseModel):
    id: uuid.UUID
    term: str
    definition: str
    source: str
    mastered: bool


class CreateTermIn(BaseModel):
    term: str
    definition: str = ""
    source: str = ""


@router.get("/terms", response_model=list[TermOut])
def list_terms(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[TermOut]:
    stmt = (
        select(LearningTerm)
        .where(LearningTerm.space_id == space.id, LearningTerm.user_id == user_id)
        .order_by(LearningTerm.created_at.desc())
    )
    items = list(db.scalars(stmt).all())
    return [
        TermOut(id=i.id, term=i.term, definition=i.definition, source=i.source, mastered=i.mastered) for i in items
    ]


@router.post("/terms", response_model=TermOut)
def create_term(
    body: CreateTermIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> TermOut:
    term = LearningTerm(space_id=space.id, user_id=user_id, term=body.term, definition=body.definition, source=body.source)
    db.add(term)
    db.commit()
    db.refresh(term)
    audit(
        "learning.term.create",
        db,
        space.id,
        user_id,
        resource_type="learning_term",
        resource_id=str(term.id),
        payload={"term": term.term},
    )
    return TermOut(id=term.id, term=term.term, definition=term.definition, source=term.source, mastered=term.mastered)


@router.post("/terms/{term_id}/master", response_model=TermOut)
def mark_mastered(
    term_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> TermOut:
    term = db.get(LearningTerm, term_id)
    if not term or term.space_id != space.id or term.user_id != user_id:
        raise HTTPException(status_code=404, detail="term not found")
    term.mastered = True
    db.add(term)
    db.commit()
    db.refresh(term)
    audit(
        "learning.term.master",
        db,
        space.id,
        user_id,
        resource_type="learning_term",
        resource_id=str(term.id),
        payload={"term": term.term},
    )
    return TermOut(id=term.id, term=term.term, definition=term.definition, source=term.source, mastered=term.mastered)

