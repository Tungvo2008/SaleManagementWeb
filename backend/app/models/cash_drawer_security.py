from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CashDrawerSecurity(Base):
    __tablename__ = "cash_drawer_security"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False, default=1)
    visibility_password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    updated_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, server_default=func.now(), onupdate=func.now()
    )
