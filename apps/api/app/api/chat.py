import json
import uuid
from collections.abc import Iterable

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from app.api.deps import audit, get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.chat import ChatCard, ChatMessage, ChatSession
from app.models.space import Space


router = APIRouter(prefix="/chat", tags=["chat"])


class SessionOut(BaseModel):
    id: uuid.UUID
    title: str


class CreateSessionIn(BaseModel):
    title: str = ""


class StreamIn(BaseModel):
    text: str


def _sse(event: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


@router.post("/sessions", response_model=SessionOut)
def create_session(
    body: CreateSessionIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> SessionOut:
    session = ChatSession(space_id=space.id, user_id=user_id, title=body.title)
    db.add(session)
    db.commit()
    db.refresh(session)
    audit("chat.session.create", db, space.id, user_id, resource_type="chat_session", resource_id=str(session.id))
    return SessionOut(id=session.id, title=session.title)


@router.get("/sessions/{session_id}/messages")
def list_messages(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[dict]:
    session = db.get(ChatSession, session_id)
    if not session or session.space_id != space.id or session.user_id != user_id:
        return []
    stmt = select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc())
    msgs = list(db.scalars(stmt).all())
    return [{"id": str(m.id), "role": m.role, "text": m.text} for m in msgs]


@router.post("/sessions/{session_id}/stream")
def stream_message(
    session_id: uuid.UUID,
    body: StreamIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> StreamingResponse:
    session = db.get(ChatSession, session_id)
    if not session:
        session = ChatSession(space_id=space.id, user_id=user_id, title="")
        db.add(session)
        db.commit()
        db.refresh(session)

    user_msg = ChatMessage(session_id=session.id, role="user", text=body.text)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    assistant_text = f"已收到：{body.text}"
    assistant_msg = ChatMessage(session_id=session.id, role="assistant", text=assistant_text)
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    card = ChatCard(message_id=assistant_msg.id, type="analysis", data={"summary": assistant_text})
    db.add(card)
    db.commit()

    assistant_message_id = str(assistant_msg.id)
    card_data = dict(card.data)

    audit(
        "chat.message.stream",
        db,
        space.id,
        user_id,
        resource_type="chat_session",
        resource_id=str(session.id),
        payload={"user_message_id": str(user_msg.id), "assistant_message_id": str(assistant_msg.id)},
    )

    def gen() -> Iterable[str]:
        yield _sse("message.delta", {"messageId": assistant_message_id, "delta": assistant_text})
        yield _sse("card.add", {"messageId": assistant_message_id, "card": {"type": "analysis", "data": card_data}})
        yield _sse("done", {"status": "ok"})

    return StreamingResponse(gen(), media_type="text/event-stream")

