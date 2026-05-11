import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.assistant import TodoItem
from app.models.learning import LearningTerm
from app.models.resources import FeedItem
from app.models.space import Space


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class PendingItemOut(BaseModel):
    kind: Literal["todo", "review", "saved_feed", "file_pending"]
    id: uuid.UUID | str
    title: str
    meta: str = ""
    route: str


class DashboardSummaryOut(BaseModel):
    todo_open: int
    review_due: int
    saved_unread: int
    file_pending: int
    items: list[PendingItemOut]


@router.get("/summary", response_model=DashboardSummaryOut)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> DashboardSummaryOut:
    todo_open = db.scalar(
        select(func.count())
        .select_from(TodoItem)
        .where(TodoItem.space_id == space.id, TodoItem.user_id == user_id, TodoItem.done == False)
    )
    review_due = db.scalar(
        select(func.count())
        .select_from(LearningTerm)
        .where(
            LearningTerm.space_id == space.id,
            LearningTerm.user_id == user_id,
            LearningTerm.mastered == False,
            LearningTerm.next_review_date <= date.today(),
        )
    )
    saved_unread = db.scalar(
        select(func.count())
        .select_from(FeedItem)
        .where(FeedItem.space_id == space.id, FeedItem.user_id == user_id, FeedItem.is_saved == True, FeedItem.is_read == False)
    )

    todos = list(
        db.scalars(
            select(TodoItem)
            .where(TodoItem.space_id == space.id, TodoItem.user_id == user_id, TodoItem.done == False)
            .order_by(TodoItem.created_at.desc())
            .limit(8)
        ).all()
    )
    reviews = list(
        db.scalars(
            select(LearningTerm)
            .where(
                LearningTerm.space_id == space.id,
                LearningTerm.user_id == user_id,
                LearningTerm.mastered == False,
                LearningTerm.next_review_date <= date.today(),
            )
            .order_by(LearningTerm.next_review_date.asc())
            .limit(8)
        ).all()
    )
    feeds = list(
        db.scalars(
            select(FeedItem)
            .where(FeedItem.space_id == space.id, FeedItem.user_id == user_id, FeedItem.is_saved == True, FeedItem.is_read == False)
            .order_by(FeedItem.created_at.desc())
            .limit(8)
        ).all()
    )

    items: list[PendingItemOut] = []
    for t in todos:
        items.append(PendingItemOut(kind="todo", id=str(t.id), title=t.text, route="/assistant", meta="待办"))
    for r in reviews:
        items.append(PendingItemOut(kind="review", id=str(r.id), title=r.term, route="/learning", meta="待复习"))
    for f in feeds:
        items.append(PendingItemOut(kind="saved_feed", id=str(f.id), title=f.title, route="/resources?tab=saved", meta="稍后读"))

    return DashboardSummaryOut(
        todo_open=int(todo_open or 0),
        review_due=int(review_due or 0),
        saved_unread=int(saved_unread or 0),
        file_pending=0,
        items=items[:12],
    )
