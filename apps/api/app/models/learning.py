import uuid
from datetime import datetime, date

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid, Integer, Float, Date, func
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
    
    # Spaced repetition fields
    next_review_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    interval: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ease_factor: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

