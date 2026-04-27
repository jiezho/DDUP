import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import audit, get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.resources import FeedSource, FeedItem, GraphEntity, FileItem
from app.models.space import Space

router = APIRouter(prefix="/resources", tags=["resources"])

class FeedSourceOut(BaseModel):
    id: uuid.UUID
    name: str
    url: str

class CreateFeedSourceIn(BaseModel):
    name: str
    url: str

class FeedItemOut(BaseModel):
    id: uuid.UUID
    title: str
    summary: str
    link: str
    is_read: bool
    is_saved: bool

@router.get("/feeds/sources", response_model=list[FeedSourceOut])
def list_feed_sources(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[FeedSourceOut]:
    stmt = select(FeedSource).where(FeedSource.space_id == space.id, FeedSource.user_id == user_id)
    items = list(db.scalars(stmt).all())
    return [FeedSourceOut(id=i.id, name=i.name, url=i.url) for i in items]

@router.post("/feeds/sources", response_model=FeedSourceOut)
def create_feed_source(
    body: CreateFeedSourceIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> FeedSourceOut:
    item = FeedSource(space_id=space.id, user_id=user_id, name=body.name, url=body.url)
    db.add(item)
    db.commit()
    db.refresh(item)
    audit("resources.feed_source.create", db, space.id, user_id, "feed_source", str(item.id), {"name": item.name})
    return FeedSourceOut(id=item.id, name=item.name, url=item.url)

@router.get("/feeds/items", response_model=list[FeedItemOut])
def list_feed_items(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[FeedItemOut]:
    stmt = select(FeedItem).where(FeedItem.space_id == space.id, FeedItem.user_id == user_id).order_by(FeedItem.created_at.desc())
    items = list(db.scalars(stmt).all())
    return [FeedItemOut(id=i.id, title=i.title, summary=i.summary, link=i.link, is_read=i.is_read, is_saved=i.is_saved) for i in items]

@router.post("/feeds/items/{item_id}/read", response_model=FeedItemOut)
def mark_feed_item_read(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> FeedItemOut:
    item = db.get(FeedItem, item_id)
    if not item or item.space_id != space.id or item.user_id != user_id:
        raise HTTPException(404, "feed item not found")
    item.is_read = True
    db.commit()
    db.refresh(item)
    return FeedItemOut(id=item.id, title=item.title, summary=item.summary, link=item.link, is_read=item.is_read, is_saved=item.is_saved)

@router.post("/feeds/items/{item_id}/save", response_model=FeedItemOut)
def toggle_save_feed_item(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> FeedItemOut:
    item = db.get(FeedItem, item_id)
    if not item or item.space_id != space.id or item.user_id != user_id:
        raise HTTPException(404, "feed item not found")
    item.is_saved = not item.is_saved
    db.commit()
    db.refresh(item)
    return FeedItemOut(id=item.id, title=item.title, summary=item.summary, link=item.link, is_read=item.is_read, is_saved=item.is_saved)


class GraphEntityOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str

class CreateGraphEntityIn(BaseModel):
    name: str
    type: str

@router.get("/graph/entities", response_model=list[GraphEntityOut])
def list_entities(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[GraphEntityOut]:
    stmt = select(GraphEntity).where(GraphEntity.space_id == space.id).order_by(GraphEntity.created_at.desc())
    items = list(db.scalars(stmt).all())
    return [GraphEntityOut(id=i.id, name=i.name, type=i.type) for i in items]

@router.post("/graph/entities", response_model=GraphEntityOut)
def create_entity(
    body: CreateGraphEntityIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> GraphEntityOut:
    item = GraphEntity(space_id=space.id, name=body.name, type=body.type)
    db.add(item)
    db.commit()
    db.refresh(item)
    audit("resources.graph.create", db, space.id, user_id, "graph_entity", str(item.id), {"name": item.name})
    return GraphEntityOut(id=item.id, name=item.name, type=item.type)

class FileOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str

@router.get("/files", response_model=list[FileOut])
def list_files(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> list[FileOut]:
    stmt = select(FileItem).where(FileItem.space_id == space.id, FileItem.user_id == user_id).order_by(FileItem.created_at.desc())
    items = list(db.scalars(stmt).all())
    return [FileOut(id=i.id, name=i.name, type=i.type) for i in items]
