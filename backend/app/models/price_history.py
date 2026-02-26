from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    stock_unit_id: Mapped[int | None] = mapped_column(ForeignKey("stock_units.id"), nullable=True, index=True)

    field: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    old_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    new_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(Text(), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, server_default=func.now(), index=True)
