import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import audit, get_current_space, get_current_user_id
from app.db.session import get_db
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
    audit(
        "action.execute",
        db,
        space.id,
        user_id,
        resource_type="action",
        resource_id=str(uuid.uuid4()),
        payload={"type": body.type, "payload": body.payload},
    )
    return {"status": "ok"}

