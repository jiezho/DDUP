import uuid
from datetime import date, datetime, timezone
from pathlib import Path
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import audit, get_current_space, get_current_user_id
from app.core.config import settings
from app.db.session import get_db
from app.models.assistant import HabitItem, TodoItem, IdeaItem
from app.models.learning import LearningTerm
from app.models.resources import GraphEntity, FeedItem
from app.models.space import Space


router = APIRouter(prefix="/actions", tags=["actions"])


class ExecuteActionIn(BaseModel):
    type: str
    payload: dict = {}


_SAFE_RAW_DIR_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _slugify(value: str) -> str:
    v = re.sub(r"\s+", "-", value.strip().lower())
    v = re.sub(r"[^a-z0-9._-]", "", v)
    v = re.sub(r"-+", "-", v).strip("-._")
    return v[:60] or "capture"


def _as_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, tuple):
        return [str(v).strip() for v in value if str(v).strip()]
    s = str(value).strip()
    return [s] if s else []


def _build_frontmatter_lines(frontmatter: dict) -> list[str]:
    lines: list[str] = ["---"]

    title = str(frontmatter.get("title") or "").replace("\n", " ").strip()
    title = title.replace('"', "\\\"")
    lines.append(f'title: "{title}"')

    category = str(frontmatter.get("category") or "raw").strip() or "raw"
    category = category.replace('"', "\\\"")
    lines.append(f'category: "{category}"')

    for key in ("created", "updated", "space_id", "user_id"):
        if key in frontmatter:
            v = str(frontmatter[key])
            v = v.replace('"', "\\\"")
            lines.append(f'{key}: "{v}"')

    tags = frontmatter.get("tags") or []
    lines.append("tags:")
    for t in tags:
        tv = str(t).replace('"', "\\\"")
        lines.append(f'  - "{tv}"')

    sources = frontmatter.get("sources") or []
    lines.append("sources:")
    for s in sources:
        sv = str(s).replace('"', "\\\"")
        lines.append(f'  - "{sv}"')

    lines.append("---")
    return lines


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

    if body.type == "idea.create":
        content = str(body.payload.get("content") or "").strip()
        tags = str(body.payload.get("tags") or "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="missing payload.content")
        item = IdeaItem(space_id=space.id, user_id=user_id, content=content, tags=tags or None)
        db.add(item)
        db.commit()
        db.refresh(item)
        return {"status": "ok", "action_id": action_id, "result": {"idea_id": str(item.id)}}

    if body.type == "graph.entity.create":
        name = str(body.payload.get("name") or "").strip()
        type_ = str(body.payload.get("type") or "Concept").strip()
        if not name:
            raise HTTPException(status_code=400, detail="missing payload.name")
        item = GraphEntity(space_id=space.id, name=name, type=type_)
        db.add(item)
        db.commit()
        db.refresh(item)
        return {"status": "ok", "action_id": action_id, "result": {"entity_id": str(item.id)}}

    if body.type == "feed.save":
        feed_id = body.payload.get("feed_id")
        try:
            feed_uuid = uuid.UUID(str(feed_id))
        except ValueError as e:
            raise HTTPException(status_code=400, detail="invalid payload.feed_id") from e
        item = db.get(FeedItem, feed_uuid)
        if not item or item.space_id != space.id or item.user_id != user_id:
            raise HTTPException(status_code=404, detail="feed not found")
        item.is_saved = True
        db.commit()
        return {"status": "ok", "action_id": action_id, "result": {"feed_id": str(item.id)}}

    if body.type == "wiki.capture_raw":
        if not settings.ddup_wiki_enabled:
            raise HTTPException(status_code=400, detail="wiki disabled")
        vault_path = settings.ddup_wiki_vault_path.strip()
        if not vault_path:
            raise HTTPException(status_code=500, detail="wiki vault path not configured")

        raw_dir_name = (settings.ddup_wiki_raw_dir or "_raw").strip().strip("/\\")
        if not raw_dir_name or not _SAFE_RAW_DIR_RE.match(raw_dir_name):
            raise HTTPException(status_code=500, detail="invalid wiki raw dir")

        title = str(body.payload.get("title") or "").strip() or "DDUP Capture"
        content = str(body.payload.get("content") or "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="missing payload.content")

        tags = _as_list(body.payload.get("tags"))
        sources = _as_list(body.payload.get("sources"))
        visibility = str(body.payload.get("visibility") or "internal").strip().lower()
        if visibility not in {"public", "internal", "pii"}:
            visibility = "internal"

        system_tags = ["ddup", f"space/{space.id}", f"visibility/{visibility}", f"card/{_slugify(str(body.payload.get('kind') or 'capture'))}"]
        merged_tags: list[str] = []
        for t in system_tags + tags:
            tv = str(t).strip()
            if not tv:
                continue
            if tv not in merged_tags:
                merged_tags.append(tv)

        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

        vault = Path(vault_path)
        raw_dir = vault / raw_dir_name
        raw_dir.mkdir(parents=True, exist_ok=True)

        slug = _slugify(title)
        suffix = uuid.uuid4().hex[:8]
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        filename = f"{ts}-{slug}-{suffix}.md"
        file_path = raw_dir / filename

        frontmatter = {
            "title": title,
            "category": "raw",
            "tags": merged_tags,
            "sources": sources,
            "created": now,
            "updated": now,
            "space_id": str(space.id),
            "user_id": user_id,
        }

        fm_lines = _build_frontmatter_lines(frontmatter)
        text = "\n".join(fm_lines) + "\n\n" + content + "\n"
        file_path.write_text(text, encoding="utf-8")

        audit(
            "wiki.capture_raw",
            db,
            space.id,
            user_id,
            resource_type="wiki_file",
            resource_id=str(file_path),
            payload={"title": title, "relative_path": f"{raw_dir_name}/{filename}"},
        )

        return {
            "status": "ok",
            "action_id": action_id,
            "result": {"relative_path": f"{raw_dir_name}/{filename}", "title": title},
        }

    return {"status": "ok", "action_id": action_id}

