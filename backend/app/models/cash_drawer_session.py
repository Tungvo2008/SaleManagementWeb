from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CashDrawerSession(Base):
    __tablename__ = "cash_drawer_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'open'"))
    opening_cash: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))
    expected_cash: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))
    counted_cash: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    variance: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    note: Mapped[str | None] = mapped_column(Text(), nullable=True)

    opened_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    opened_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    closed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    entries: Mapped[list["CashDrawerEntry"]] = relationship(
        "CashDrawerEntry",
        back_populates="session",
        cascade="all, delete-orphan",
    )
