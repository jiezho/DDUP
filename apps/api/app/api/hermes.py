from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_space, get_current_user_id
from app.models.space import Space
from app.services.hermes_registry import (
    get_blueprint,
    get_instance_detail,
    get_overview,
    list_instances,
    list_skills,
    search_shared_library,
)

router = APIRouter(prefix="/hermes", tags=["hermes"])


@router.get("/overview")
def hermes_overview(
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> dict[str, Any]:
    return get_overview()


@router.get("/blueprint")
def hermes_blueprint(
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> dict[str, Any]:
    return get_blueprint()


@router.get("/instances")
def hermes_instances(
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> dict[str, Any]:
    items = list_instances()
    return {"items": items, "total": len(items)}


@router.get("/instances/{instance_id}")
def hermes_instance_detail(
    instance_id: str,
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> dict[str, Any]:
    detail = get_instance_detail(instance_id)
    if not detail:
        raise HTTPException(status_code=404, detail="instance not found")
    return detail


@router.get("/skills")
def hermes_skills(
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> dict[str, Any]:
    return list_skills()


@router.get("/search")
def hermes_search(
    q: str = Query(default="", min_length=0),
    limit: int = Query(default=10, ge=1, le=50),
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> dict[str, Any]:
    items = search_shared_library(q, limit=limit)
    return {"items": items, "query": q, "total": len(items)}
