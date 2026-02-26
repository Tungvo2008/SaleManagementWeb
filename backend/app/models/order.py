from __future__ import annotations

from decimal import Decimal
from datetime import datetime
from typing import Literal

from sqlalchemy import String, Text, Numeric, DateTime, func, text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'draft'"))
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), index=True, nullable=True)
    note: Mapped[str | None] = mapped_column(Text(), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12,2), nullable=False, server_default=text("0"))
    # Invoice-level discount:
    # - discount_mode="amount": discount_value is VND amount
    # - discount_mode="percent": discount_value is percent (0..100)
    discount_mode: Mapped[str] = mapped_column(String(10), nullable=False, server_default=text("'amount'"))
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12,2), nullable=False, server_default=text("0"))
    discount_total: Mapped[Decimal] = mapped_column(Numeric(12,2), nullable=False, server_default=text("0"))
    grand_total: Mapped[Decimal] = mapped_column(Numeric(12,2), nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, server_default=func.now(), onupdate=func.now())
    items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan"
    )
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    paid_amount: Mapped[Decimal | None] = mapped_column(Numeric(12,2), nullable=True)
    change_amount: Mapped[Decimal | None] = mapped_column(Numeric(12,2), nullable=True)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)
