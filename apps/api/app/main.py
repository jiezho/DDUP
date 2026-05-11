from fastapi import FastAPI

from app.api import api_router
from app.api.health import router as health_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import engine
from app.models.base import Base
from app import models


configure_logging()

app = FastAPI(title=settings.app_name)
app.include_router(health_router)
app.include_router(api_router)


@app.on_event("startup")
def on_startup() -> None:
    _ = models
    Base.metadata.create_all(bind=engine)

