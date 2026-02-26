from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class PriceHistoryOut(BaseModel):
    id: int
    variant_id: int
    stock_unit_id: int | None = None
    field: str
    old_value: Decimal | None = None
    new_value: Decimal | None = None
    source: str
    note: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
