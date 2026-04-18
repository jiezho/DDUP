from fastapi import APIRouter

from app.api.audit import router as audit_router
from app.api.spaces import router as spaces_router


api_router = APIRouter(prefix="/api")
api_router.include_router(spaces_router)
api_router.include_router(audit_router)
