import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import audit, get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.assistant import HabitItem, TodoItem
from app.models.learning import LearningTerm
from app.models.space import Space


router = APIRouter(prefix="/actions", tags=["actions"])


class ExecuteActionIn(BaseModel):
    type: str
    payload: dict = {}


@router.post("/execute")
def execute_action(
    body: ExecuteActionIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> dict:
    action_id = str(uuid.uuid4())

    audit(
        "action.execute",
        db,
        space.id,
        user_id,
        resource_type="action",
        resource_id=action_id,
        payload={"type": body.type, "payload": body.payload},
    )

    if body.type == "todo.create":
        text = str(body.payload.get("text") or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="missing payload.text")
        item = TodoItem(space_id=space.id, user_id=user_id, text=text)
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
            payload={"text": item.text, "via": "action"},
        )
        return {"status": "ok", "action_id": action_id, "result": {"todo_id": str(item.id)}}

    if body.type == "todo.complete":
        todo_id = body.payload.get("todo_id")
        try:
            todo_uuid = uuid.UUID(str(todo_id))
        except ValueError as e:
            raise HTTPException(status_code=400, detail="invalid payload.todo_id") from e
        item = db.get(TodoItem, todo_uuid)
        if not item or item.space_id != space.id or item.user_id != user_id:
            raise HTTPException(status_code=404, detail="todo not found")
        item.done = True
        db.add(item)
        db.commit()
        audit(
            "assistant.todo.complete",
            db,
            space.id,
            user_id,
            resource_type="todo_item",
            resource_id=str(item.id),
            payload={"text": item.text, "via": "action"},
        )
        return {"status": "ok", "action_id": action_id, "result": {"todo_id": str(item.id)}}

    if body.type == "term.create":
        term_text = str(body.payload.get("term") or "").strip()
        if not term_text:
            raise HTTPException(status_code=400, detail="missing payload.term")
        definition = str(body.payload.get("definition") or "")
        source = str(body.payload.get("source") or "")
        term = LearningTerm(space_id=space.id, user_id=user_id, term=term_text, definition=definition, source=source)
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
            payload={"term": term.term, "via": "action"},
        )
        return {"status": "ok", "action_id": action_id, "result": {"term_id": str(term.id)}}

    if body.type == "habit.checkin":
        habit_id = body.payload.get("habit_id")
        try:
            habit_uuid = uuid.UUID(str(habit_id))
        except ValueError as e:
            raise HTTPException(status_code=400, detail="invalid payload.habit_id") from e
        item = db.get(HabitItem, habit_uuid)
        if not item or item.space_id != space.id or item.user_id != user_id:
            raise HTTPException(status_code=404, detail="habit not found")
        today = date.today()
        if item.last_checkin != today:
            item.streak += 1
            item.last_checkin = today
        db.add(item)
        db.commit()
        audit(
            "assistant.habit.checkin",
            db,
            space.id,
            user_id,
            resource_type="habit_item",
            resource_id=str(item.id),
            payload={"name": item.name, "streak": item.streak, "via": "action"},
        )
        return {"status": "ok", "action_id": action_id, "result": {"habit_id": str(item.id), "streak": item.streak}}

    return {"status": "ok", "action_id": action_id}

