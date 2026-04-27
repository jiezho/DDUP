import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import audit, get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.assistant import HabitItem, TodoItem, IdeaItem
from app.models.space import Space


router = APIRouter(prefix="/assistant", tags=["assistant"])


class TodoOut(BaseModel):
    id: uuid.UUID
    text: str
    done: bool


class CreateTodoIn(BaseModel):
    text: str


class HabitOut(BaseModel):
    id: uuid.UUID
    name: str
    cadence: str
    streak: int
    last_checkin: date | None


class CreateHabitIn(BaseModel):
    name: str
    cadence: str = "daily"


class IdeaOut(BaseModel):
    id: uuid.UUID
    content: str
    tags: str | None


class CreateIdeaIn(BaseModel):
    content: str
    tags: str | None = None


@router.get("/todos", response_model=list[TodoOut])
def list_todos(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[TodoOut]:
    stmt = (
        select(TodoItem)
        .where(TodoItem.space_id == space.id, TodoItem.user_id == user_id)
        .order_by(TodoItem.created_at.desc())
    )
    items = list(db.scalars(stmt).all())
    return [TodoOut(id=i.id, text=i.text, done=i.done) for i in items]


@router.post("/todos", response_model=TodoOut)
def create_todo(
    body: CreateTodoIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> TodoOut:
    item = TodoItem(space_id=space.id, user_id=user_id, text=body.text)
    db.add(item)
    db.commit()
    db.refresh(item)
    audit(
        "assistant.todo.create",
        db,
        space.id,
        user_id,
        resource_type="todo_item",
        resource_id=str(item.id),
        payload={"text": item.text},
    )
    return TodoOut(id=item.id, text=item.text, done=item.done)


@router.post("/todos/{todo_id}/complete", response_model=TodoOut)
def complete_todo(
    todo_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> TodoOut:
    item = db.get(TodoItem, todo_id)
    if not item or item.space_id != space.id or item.user_id != user_id:
        raise HTTPException(status_code=404, detail="todo not found")
    item.done = True
    db.add(item)
    db.commit()
    db.refresh(item)
    audit(
        "assistant.todo.complete",
        db,
        space.id,
        user_id,
        resource_type="todo_item",
        resource_id=str(item.id),
        payload={"text": item.text},
    )
    return TodoOut(id=item.id, text=item.text, done=item.done)


@router.get("/habits", response_model=list[HabitOut])
def list_habits(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[HabitOut]:
    stmt = (
        select(HabitItem)
        .where(HabitItem.space_id == space.id, HabitItem.user_id == user_id)
        .order_by(HabitItem.created_at.desc())
    )
    items = list(db.scalars(stmt).all())
    return [
        HabitOut(id=i.id, name=i.name, cadence=i.cadence, streak=i.streak, last_checkin=i.last_checkin) for i in items
    ]


@router.post("/habits", response_model=HabitOut)
def create_habit(
    body: CreateHabitIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HabitOut:
    item = HabitItem(space_id=space.id, user_id=user_id, name=body.name, cadence=body.cadence)
    db.add(item)
    db.commit()
    db.refresh(item)
    audit(
        "assistant.habit.create",
        db,
        space.id,
        user_id,
        resource_type="habit_item",
        resource_id=str(item.id),
        payload={"name": item.name, "cadence": item.cadence},
    )
    return HabitOut(id=item.id, name=item.name, cadence=item.cadence, streak=item.streak, last_checkin=item.last_checkin)


@router.get("/ideas", response_model=list[IdeaOut])
def list_ideas(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[IdeaOut]:
    stmt = (
        select(IdeaItem)
        .where(IdeaItem.space_id == space.id, IdeaItem.user_id == user_id)
        .order_by(IdeaItem.created_at.desc())
    )
    items = list(db.scalars(stmt).all())
    return [IdeaOut(id=i.id, content=i.content, tags=i.tags) for i in items]


@router.post("/ideas", response_model=IdeaOut)
def create_idea(
    body: CreateIdeaIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> IdeaOut:
    item = IdeaItem(space_id=space.id, user_id=user_id, content=body.content, tags=body.tags)
    db.add(item)
    db.commit()
    db.refresh(item)
    audit(
        "assistant.idea.create",
        db,
        space.id,
        user_id,
        resource_type="idea_item",
        resource_id=str(item.id),
        payload={"content": item.content[:50]},
    )
    return IdeaOut(id=item.id, content=item.content, tags=item.tags)


@router.post("/habits/{habit_id}/checkin", response_model=HabitOut)
def checkin_habit(
    habit_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HabitOut:
    item = db.get(HabitItem, habit_id)
    if not item or item.space_id != space.id or item.user_id != user_id:
        raise HTTPException(status_code=404, detail="habit not found")
    today = date.today()
    if item.last_checkin != today:
        item.streak += 1
        item.last_checkin = today
    db.add(item)
    db.commit()
    db.refresh(item)
    audit(
        "assistant.habit.checkin",
        db,
        space.id,
        user_id,
        resource_type="habit_item",
        resource_id=str(item.id),
        payload={"name": item.name, "streak": item.streak},
    )
    return HabitOut(id=item.id, name=item.name, cadence=item.cadence, streak=item.streak, last_checkin=item.last_checkin)

