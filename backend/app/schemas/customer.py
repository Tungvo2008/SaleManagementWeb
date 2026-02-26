from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


Gender = Literal["unknown", "male", "female", "other"]


class CustomerBase(BaseModel):
    code: str | None = Field(None, max_length=64)
    name: str = Field(..., max_length=200)
    phone: str | None = Field(None, max_length=32)
    email: str | None = Field(None, max_length=200)
    address: str | None = None
    tax_code: str | None = Field(None, max_length=64)
    gender: Gender = "unknown"
    birthday: date | None = None
    points: int = Field(0, ge=0)
    debt: Decimal = Field(Decimal("0"), ge=0)
    note: str | None = None
    is_active: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    code: str | None = Field(None, max_length=64)
    name: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=32)
    email: str | None = Field(None, max_length=200)
    address: str | None = None
    tax_code: str | None = Field(None, max_length=64)
    gender: Gender | None = None
    birthday: date | None = None
    points: int | None = Field(None, ge=0)
    debt: Decimal | None = Field(None, ge=0)
    note: str | None = None
    is_active: bool | None = None


class CustomerOut(CustomerBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

