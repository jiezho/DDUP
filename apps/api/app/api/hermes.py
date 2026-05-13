from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse
from urllib.parse import quote

from app.api.deps import audit, get_current_space, get_current_user_id
from app.db.session import get_db
from app.models.space import Space
from app.schemas.hermes import (
    HermesActionResultOut,
    HermesArchiveWriteIn,
    HermesFeedbackSummaryOut,
    HermesInstanceDetailOut,
    HermesInstancesResponse,
    HermesMemoryWriteIn,
    HermesOpsCheckOut,
    HermesRegisterInstanceIn,
    HermesRuntimeStatusOut,
    HermesSearchResponse,
    HermesStorageDeleteIn,
    HermesStorageDeleteOut,
    HermesStorageListResponse,
    HermesStoragePresignIn,
    HermesStoragePresignOut,
    HermesStorageUploadOut,
    HermesWikiWriteIn,
)
from app.services.hermes_archive import get_runtime_status
from app.services.hermes_actions import archive_output, register_instance, save_memory_entry, search_library, write_wiki_raw
from app.services.hermes_feedback import get_feedback_summary
from app.services.hermes_ops import get_ops_check
from app.services.hermes_registry import (
    get_blueprint,
    get_instance_detail,
    get_overview,
    list_instances,
    list_skills,
)
from app.services.hermes_storage import (
    delete_storage_object,
    download_storage_object,
    list_storage_objects,
    presign_storage_object,
    upload_storage_object,
)

router = APIRouter(prefix="/hermes", tags=["hermes"])


@router.get("/overview")
def hermes_overview(
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> dict:
    return get_overview()


@router.get("/blueprint")
def hermes_blueprint(
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> dict:
    return get_blueprint()


@router.get("/instances", response_model=HermesInstancesResponse)
def hermes_instances(
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> HermesInstancesResponse:
    items = list_instances()
    return HermesInstancesResponse(items=items, total=len(items))


@router.get("/instances/{instance_id}", response_model=HermesInstanceDetailOut)
def hermes_instance_detail(
    instance_id: str,
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> HermesInstanceDetailOut:
    detail = get_instance_detail(instance_id)
    if not detail:
        raise HTTPException(status_code=404, detail="instance not found")
    return HermesInstanceDetailOut(**detail)


@router.post("/instances/register", response_model=HermesActionResultOut)
def hermes_register_instance(
    body: HermesRegisterInstanceIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HermesActionResultOut:
    try:
        result = HermesActionResultOut(**register_instance(body.model_dump()))
        audit(
            "hermes.instance.register",
            db,
            space.id,
            user_id,
            resource_type="hermes_instance",
            resource_id=body.id,
            payload={"name": body.name},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/skills")
def hermes_skills(
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> dict:
    return list_skills()


@router.get("/runtime", response_model=HermesRuntimeStatusOut)
def hermes_runtime(
    limit: int = Query(default=5, ge=1, le=20),
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> HermesRuntimeStatusOut:
    return HermesRuntimeStatusOut(**get_runtime_status(limit=limit))


@router.get("/feedback/summary", response_model=HermesFeedbackSummaryOut)
def hermes_feedback_summary(
    action_limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HermesFeedbackSummaryOut:
    return HermesFeedbackSummaryOut(
        **get_feedback_summary(db, space_id=space.id, user_id=user_id, action_limit=action_limit)
    )


@router.get("/ops/check", response_model=HermesOpsCheckOut)
def hermes_ops_check(
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> HermesOpsCheckOut:
    return HermesOpsCheckOut(**get_ops_check())


@router.get("/storage/objects", response_model=HermesStorageListResponse)
def hermes_storage_objects(
    instance_id: str | None = Query(default=None),
    prefix: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> HermesStorageListResponse:
    return HermesStorageListResponse(**list_storage_objects(instance_id=instance_id, prefix=prefix, limit=limit))


@router.post("/storage/upload", response_model=HermesStorageUploadOut)
async def hermes_storage_upload(
    file: UploadFile = File(...),
    instance_id: str | None = Form(default=None),
    category: str = Form(default="assets"),
    tags: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HermesStorageUploadOut:
    payload = await file.read()
    try:
        result = HermesStorageUploadOut(
            **upload_storage_object(
                filename=file.filename or "upload.bin",
                content=payload,
                instance_id=instance_id,
                category=category,
                tags=tags,
                content_type=file.content_type,
            )
        )
        audit(
            "hermes.storage.upload",
            db,
            space.id,
            user_id,
            resource_type="storage_object",
            resource_id=result.key or (file.filename or ""),
            payload={"instance_id": instance_id, "category": category, "status": result.status},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/storage/download")
def hermes_storage_download(
    key: str = Query(..., min_length=1),
    instance_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> StreamingResponse:
    try:
        result = download_storage_object(key, instance_id)
        audit(
            "hermes.storage.download",
            db,
            space.id,
            user_id,
            resource_type="storage_object",
            resource_id=key,
            payload={"instance_id": instance_id, "status": result["status"]},
        )
        if result["status"] != "success":
            raise HTTPException(status_code=502, detail=result["message"] or "download failed")
        filename = quote(result["filename"])
        return StreamingResponse(
            iter([result["content"]]),
            media_type=result["media_type"],
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/search", response_model=HermesSearchResponse)
def hermes_search(
    q: str = Query(default="", min_length=0),
    limit: int = Query(default=10, ge=1, le=50),
    sources: list[str] = Query(default=[]),
    instance_id: str | None = Query(default=None),
    _user_id: str = Depends(get_current_user_id),
    _space: Space = Depends(get_current_space),
) -> HermesSearchResponse:
    items = search_library(q, limit=limit, sources=sources, instance_id=instance_id)["items"]
    return HermesSearchResponse(items=items, query=q, total=len(items))


@router.post("/archive/save", response_model=HermesActionResultOut)
def hermes_save_archive(
    body: HermesArchiveWriteIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HermesActionResultOut:
    try:
        attachments = [
            {"filename": item.filename, "content_bytes": item.decoded_bytes(), "content_type": item.content_type}
            for item in (body.attachments or [])
        ]
        result = HermesActionResultOut(
            **archive_output(
                body.instance_id,
                body.job_id,
                body.title,
                body.summary,
                body.content,
                body.metadata,
                attachments,
            )
        )
        audit(
            "hermes.archive.save",
            db,
            space.id,
            user_id,
            resource_type="hermes_archive",
            resource_id=body.job_id,
            payload={"instance_id": body.instance_id, "title": body.title},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/storage/presign", response_model=HermesStoragePresignOut)
def hermes_storage_presign(
    body: HermesStoragePresignIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HermesStoragePresignOut:
    try:
        result = HermesStoragePresignOut(**presign_storage_object(body.key, body.expires_days))
        audit(
            "hermes.storage.presign",
            db,
            space.id,
            user_id,
            resource_type="storage_object",
            resource_id=body.key,
            payload={"expires_days": body.expires_days, "status": result.status},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/storage/delete", response_model=HermesStorageDeleteOut)
def hermes_storage_delete(
    body: HermesStorageDeleteIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HermesStorageDeleteOut:
    try:
        result = HermesStorageDeleteOut(**delete_storage_object(body.key, body.instance_id))
        audit(
            "hermes.storage.delete",
            db,
            space.id,
            user_id,
            resource_type="storage_object",
            resource_id=body.key,
            payload={"instance_id": body.instance_id, "status": result.status},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/memory/save", response_model=HermesActionResultOut)
def hermes_save_memory(
    body: HermesMemoryWriteIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HermesActionResultOut:
    try:
        result = HermesActionResultOut(**save_memory_entry(body.instance_id, body.scope, body.key, body.content))
        audit(
            "hermes.memory.save",
            db,
            space.id,
            user_id,
            resource_type="memory_entry",
            resource_id=body.key,
            payload={"instance_id": body.instance_id, "scope": body.scope},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/wiki/raw", response_model=HermesActionResultOut)
def hermes_write_wiki_raw(
    body: HermesWikiWriteIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
    space: Space = Depends(get_current_space),
) -> HermesActionResultOut:
    try:
        result = HermesActionResultOut(**write_wiki_raw(body.instance_id, body.title, body.content, body.tags))
        audit(
            "hermes.wiki.raw.write",
            db,
            space.id,
            user_id,
            resource_type="wiki_raw",
            resource_id=body.title,
            payload={"instance_id": body.instance_id, "tags": body.tags},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
