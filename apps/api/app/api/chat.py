import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse
import httpx

from app.api.deps import audit, get_current_space, get_current_user_id
from app.core.config import settings
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
async def stream_message(
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

    assistant_msg = ChatMessage(session_id=session.id, role="assistant", text="")
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    assistant_message_id = str(assistant_msg.id)

    audit(
        "chat.message.stream",
        db,
        space.id,
        user_id,
        resource_type="chat_session",
        resource_id=str(session.id),
        payload={"user_message_id": str(user_msg.id), "assistant_message_id": str(assistant_msg.id)},
    )

    async def gen() -> AsyncIterator[str]:
        hermes_base = (settings.hermes_api_base or "").strip().rstrip("/")
        hermes_model = (settings.hermes_model or "hermes-agent").strip() or "hermes-agent"
        hermes_key = (settings.hermes_api_key or "").strip()

        if not hermes_base:
            assistant_text = f"已收到：{body.text}"
            assistant_msg.text = assistant_text
            db.add(assistant_msg)
            db.commit()
            db.refresh(assistant_msg)

            card = ChatCard(message_id=assistant_msg.id, type="analysis", data={"summary": assistant_text})
            db.add(card)
            db.commit()

            yield _sse("message.delta", {"messageId": assistant_message_id, "delta": assistant_text})
            yield _sse("card.add", {"messageId": assistant_message_id, "card": {"type": "analysis", "data": dict(card.data)}})
            yield _sse("done", {"status": "ok"})
            return

        stmt = select(ChatMessage).where(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at.asc())
        history = list(db.scalars(stmt).all())
        messages: list[dict] = [
            {
                "role": "system",
                "content": (
                    "你是 DDUP 的智能助手。请用简洁中文回答，必要时用要点列表。"
                    "如果你执行了检索/工具调用，请在答案中说明你基于哪些结果。"
                ),
            }
        ]
        messages.extend([{"role": m.role, "content": m.text} for m in history if m.role in ("user", "assistant") and m.text is not None])

        url = f"{hermes_base}/chat/completions"
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if hermes_key:
            headers["Authorization"] = f"Bearer {hermes_key}"

        assistant_text = ""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
                async with client.stream(
                    "POST",
                    url,
                    headers=headers,
                    json={"model": hermes_model, "messages": messages, "stream": True},
                ) as resp:
                    resp.raise_for_status()

                    event_name: str | None = None
                    data_parts: list[str] = []

                    async for line in resp.aiter_lines():
                        if line is None:
                            continue
                        if line == "":
                            if not data_parts:
                                event_name = None
                                continue
                            data_str = "\n".join(data_parts).strip()
                            data_parts = []
                            ev = (event_name or "").strip() or None
                            event_name = None

                            if data_str == "[DONE]":
                                break
                            try:
                                payload = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue

                            if ev == "hermes.tool.progress":
                                summary = ""
                                if isinstance(payload, dict):
                                    tool = payload.get("tool") or payload.get("name") or "tool"
                                    status = payload.get("status") or payload.get("phase") or ""
                                    summary = f"{tool} {status}".strip()
                                if summary:
                                    yield _sse(
                                        "card.add",
                                        {"messageId": assistant_message_id, "card": {"type": "tool", "data": {"summary": summary}}},
                                    )
                                continue

                            if not isinstance(payload, dict):
                                continue
                            choices = payload.get("choices")
                            if not isinstance(choices, list) or not choices:
                                continue
                            delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
                            if not isinstance(delta, dict):
                                continue
                            piece = delta.get("content")
                            if isinstance(piece, str) and piece:
                                assistant_text += piece
                                yield _sse("message.delta", {"messageId": assistant_message_id, "delta": piece})
                            continue

                        if line.startswith("event:"):
                            event_name = line.replace("event:", "", 1).strip()
                            continue
                        if line.startswith("data:"):
                            data_parts.append(line.replace("data:", "", 1).strip())
                            continue

        except Exception:
            assistant_text = assistant_text or "Hermes 调用失败（请检查 Hermes API Server 是否可达且密钥正确）。"
            yield _sse("message.delta", {"messageId": assistant_message_id, "delta": assistant_text})

        assistant_msg.text = assistant_text
        db.add(assistant_msg)
        db.commit()
        db.refresh(assistant_msg)

        card = ChatCard(message_id=assistant_msg.id, type="analysis", data={"summary": assistant_text})
        db.add(card)
        db.commit()

        yield _sse("card.add", {"messageId": assistant_message_id, "card": {"type": "analysis", "data": dict(card.data)}})
        yield _sse("done", {"status": "ok"})

    return StreamingResponse(gen(), media_type="text/event-stream")

