import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LearningTerm(Base):
    __tablename__ = "learning_terms"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(200), nullable=False)
    term: Mapped[str] = mapped_column(String(200), nullable=False)
    definition: Mapped[str] = mapped_column(String, nullable=False, default="")
    source: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    mastered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

