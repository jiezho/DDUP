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

    session_id = session.id

    user_msg = ChatMessage(session_id=session.id, role="user", text=body.text)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    assistant_msg = ChatMessage(session_id=session.id, role="assistant", text="")
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    assistant_message_id = str(assistant_msg.id)
    assistant_msg_id = assistant_msg.id

    audit(
        "chat.message.stream",
        db,
        space.id,
        user_id,
        resource_type="chat_session",
        resource_id=str(session_id),
        payload={"user_message_id": str(user_msg.id), "assistant_message_id": str(assistant_msg.id)},
    )

    async def gen() -> AsyncIterator[str]:
        hermes_base = (settings.hermes_api_base or "").strip().rstrip("/")
        hermes_model = (settings.hermes_model or "hermes-agent").strip() or "hermes-agent"
        hermes_key = (settings.hermes_api_key or "").strip()

        if not hermes_base:
            assistant_text = (
                "（Mock）Hermes 未配置，当前未调用 Hermes 生成对话。\n"
                "请在 apps/api/.env 或环境变量中设置：HERMES_API_BASE=http://<hermes-host>:8642/v1（可选 HERMES_API_KEY、HERMES_MODEL）。\n"
                f"已收到：{body.text}"
            )
            target_msg = db.get(ChatMessage, assistant_msg_id)
            if target_msg is not None:
                target_msg.text = assistant_text
                db.commit()
                db.refresh(target_msg)

            card = ChatCard(message_id=assistant_msg_id, type="analysis", data={"summary": assistant_text})
            db.add(card)
            db.commit()

            yield _sse("message.delta", {"messageId": assistant_message_id, "delta": assistant_text})
            yield _sse("card.add", {"messageId": assistant_message_id, "card": {"type": "analysis", "data": dict(card.data)}})
            yield _sse("done", {"status": "ok"})
            return

        stmt = select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc())
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
        for m in history:
            if m.role in ("user", "assistant") and m.text is not None:
                messages.append({"role": m.role, "content": m.text})

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

                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        
                        line = line.strip()
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                                
                            try:
                                payload = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue
                                
                            choices = payload.get("choices")
                            if not choices or not isinstance(choices, list):
                                continue
                                
                            delta = choices[0].get("delta", {})
                            piece = delta.get("content")
                            if piece:
                                assistant_text += piece
                                yield _sse("message.delta", {"messageId": assistant_message_id, "delta": piece})

        except Exception as e:
            print(f"Hermes Stream Error: {e}")
            assistant_text = assistant_text or "Hermes 调用失败（请检查 Hermes API Server 是否可达且密钥正确）。"
            yield _sse("message.delta", {"messageId": assistant_message_id, "delta": assistant_text})

        target_msg = db.get(ChatMessage, assistant_msg_id)
        if target_msg is not None:
            target_msg.text = assistant_text
            db.commit()
            db.refresh(target_msg)

        card = ChatCard(message_id=assistant_msg_id, type="analysis", data={"summary": assistant_text})
        db.add(card)
        db.commit()

        yield _sse("card.add", {"messageId": assistant_message_id, "card": {"type": "analysis", "data": dict(card.data)}})
        yield _sse("done", {"status": "ok"})

    return StreamingResponse(gen(), media_type="text/event-stream")
