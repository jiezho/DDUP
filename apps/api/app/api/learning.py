import uuid
from datetime import date, timedelta
from typing import Literal
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
    next_review_date: date | None


class CreateTermIn(BaseModel):
    term: str
    definition: str = ""
    source: str = ""


class ReviewTermIn(BaseModel):
    # quality: 0 (blackout), 1 (incorrect), 2 (correct but hard), 3 (correct), 4 (perfect)
    quality: int


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
        TermOut(id=i.id, term=i.term, definition=i.definition, source=i.source, mastered=i.mastered, next_review_date=i.next_review_date)
        for i in items
    ]


@router.post("/terms", response_model=TermOut)
def create_term(
    body: CreateTermIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> TermOut:
    term = LearningTerm(
        space_id=space.id, user_id=user_id, term=body.term, definition=body.definition, source=body.source, next_review_date=date.today()
    )
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
    return TermOut(id=term.id, term=term.term, definition=term.definition, source=term.source, mastered=term.mastered, next_review_date=term.next_review_date)


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
    return TermOut(id=term.id, term=term.term, definition=term.definition, source=term.source, mastered=term.mastered, next_review_date=term.next_review_date)


@router.get("/terms/review", response_model=list[TermOut])
def get_review_queue(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[TermOut]:
    stmt = (
        select(LearningTerm)
        .where(
            LearningTerm.space_id == space.id,
            LearningTerm.user_id == user_id,
            LearningTerm.mastered == False,
            LearningTerm.next_review_date <= date.today()
        )
        .order_by(LearningTerm.next_review_date.asc())
        .limit(20)
    )
    items = list(db.scalars(stmt).all())
    return [
        TermOut(id=i.id, term=i.term, definition=i.definition, source=i.source, mastered=i.mastered, next_review_date=i.next_review_date)
        for i in items
    ]


@router.post("/terms/{term_id}/review", response_model=TermOut)
def review_term(
    term_id: uuid.UUID,
    body: ReviewTermIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> TermOut:
    term = db.get(LearningTerm, term_id)
    if not term or term.space_id != space.id or term.user_id != user_id:
        raise HTTPException(status_code=404, detail="term not found")
    
    q = max(0, min(5, body.quality))
    if q < 3:
        term.repetitions = 0
        term.interval = 1
    else:
        if term.repetitions == 0:
            term.interval = 1
        elif term.repetitions == 1:
            term.interval = 6
        else:
            term.interval = round(term.interval * term.ease_factor)
        term.repetitions += 1
    
    term.ease_factor = term.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    if term.ease_factor < 1.3:
        term.ease_factor = 1.3
        
    term.next_review_date = date.today() + timedelta(days=term.interval)
    
    db.add(term)
    db.commit()
    db.refresh(term)
    
    audit(
        "learning.term.review",
        db,
        space.id,
        user_id,
        resource_type="learning_term",
        resource_id=str(term.id),
        payload={"quality": q, "next_interval": term.interval},
    )
    
    return TermOut(id=term.id, term=term.term, definition=term.definition, source=term.source, mastered=term.mastered, next_review_date=term.next_review_date)

