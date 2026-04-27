import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.assistant import TodoItem, HabitItem, IdeaItem
from app.models.learning import LearningTerm
from app.models.space import Space

router = APIRouter(prefix="/me", tags=["me"])

class DashboardStatsOut(BaseModel):
    todos_total: int
    todos_done: int
    habits_active: int
    terms_total: int
    terms_mastered: int
    ideas_total: int

@router.get("/dashboard", response_model=DashboardStatsOut)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> DashboardStatsOut:
    todos_total = db.scalar(select(func.count(TodoItem.id)).where(TodoItem.space_id == space.id, TodoItem.user_id == user_id)) or 0
    todos_done = db.scalar(select(func.count(TodoItem.id)).where(TodoItem.space_id == space.id, TodoItem.user_id == user_id, TodoItem.done == True)) or 0
    habits_active = db.scalar(select(func.count(HabitItem.id)).where(HabitItem.space_id == space.id, HabitItem.user_id == user_id)) or 0
    terms_total = db.scalar(select(func.count(LearningTerm.id)).where(LearningTerm.space_id == space.id, LearningTerm.user_id == user_id)) or 0
    terms_mastered = db.scalar(select(func.count(LearningTerm.id)).where(LearningTerm.space_id == space.id, LearningTerm.user_id == user_id, LearningTerm.mastered == True)) or 0
    ideas_total = db.scalar(select(func.count(IdeaItem.id)).where(IdeaItem.space_id == space.id, IdeaItem.user_id == user_id)) or 0

    return DashboardStatsOut(
        todos_total=todos_total,
        todos_done=todos_done,
        habits_active=habits_active,
        terms_total=terms_total,
        terms_mastered=terms_mastered,
        ideas_total=ideas_total,
    )

class TemplateOut(BaseModel):
    id: str
    name: str
    description: str

@router.get("/templates", response_model=list[TemplateOut])
def list_templates() -> list[TemplateOut]:
    return [
        TemplateOut(id="report_weekly", name="周报模板", description="自动汇总本周的待办、学习与习惯数据"),
        TemplateOut(id="paper_review", name="文献综述", description="基于知识图谱和论文笔记生成综述框架"),
    ]
