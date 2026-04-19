from fastapi import APIRouter

from app.api.actions import router as actions_router
from app.api.assistant import router as assistant_router
from app.api.audit import router as audit_router
from app.api.chat import router as chat_router
from app.api.learning import router as learning_router
from app.api.spaces import router as spaces_router


api_router = APIRouter(prefix="/api")
api_router.include_router(spaces_router)
api_router.include_router(audit_router)
api_router.include_router(chat_router)
api_router.include_router(actions_router)
api_router.include_router(learning_router)
api_router.include_router(assistant_router)
