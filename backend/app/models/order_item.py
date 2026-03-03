from __future__ import annotations

from decimal import Decimal

from sqlalchemy import String, ForeignKey, Numeric, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    stock_unit_id: Mapped[int | None] = mapped_column(ForeignKey("stock_units.id"), nullable=True, index=True)

    pricing_mode: Mapped[str] = mapped_column(String(20), nullable=False)  # normal/meter/roll

    qty: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Item-level discount:
    # - discount_mode="amount": discount_value is amount off this line
    # - discount_mode="percent": discount_value is percent off this line (0..100)
    # - discount_mode is NULL => no discount
    discount_mode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    discount_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    refunded_qty: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))

    name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    sku_snapshot: Mapped[str | None] = mapped_column(String(64), nullable=True)
    uom_snapshot: Mapped[str | None] = mapped_column(String(64), nullable=True)

    order: Mapped["Order"] = relationship("Order", back_populates="items")
