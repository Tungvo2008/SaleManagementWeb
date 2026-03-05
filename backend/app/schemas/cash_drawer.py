from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CashDrawerOpenIn(BaseModel):
    opening_cash: Decimal = Field(Decimal("0"), ge=0)
    note: str | None = None


class CashDrawerCloseIn(BaseModel):
    counted_cash: Decimal = Field(..., ge=0)
    note: str | None = None


class CashDrawerManagerWithdrawIn(BaseModel):
    amount: Decimal = Field(..., gt=0)
    note: str | None = None


class CashDrawerEntryOut(BaseModel):
    id: int
    session_id: int
    entry_type: str
    delta_cash: Decimal
    note: str | None = None
    order_id: int | None = None
    created_at: datetime
    created_by_user_id: int

    class Config:
        from_attributes = True


class CashDrawerSessionOut(BaseModel):
    id: int
    status: str
    opening_cash: Decimal
    expected_cash: Decimal
    counted_cash: Decimal | None = None
    variance: Decimal | None = None
    note: str | None = None
    opened_at: datetime
    closed_at: datetime | None = None
    opened_by_user_id: int
    closed_by_user_id: int | None = None
    opened_by_username: str | None = None
    closed_by_username: str | None = None
    entries: list[CashDrawerEntryOut] = []

    class Config:
        from_attributes = True
