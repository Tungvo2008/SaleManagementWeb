from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CashDrawerEntry(Base):
    __tablename__ = "cash_drawer_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("cash_drawer_sessions.id"), nullable=False, index=True)
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    delta_cash: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text(), nullable=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, server_default=func.now())
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    session: Mapped["CashDrawerSession"] = relationship("CashDrawerSession", back_populates="entries")
