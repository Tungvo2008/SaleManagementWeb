from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class SupplierBase(BaseModel):
    code: str | None = Field(None, max_length=64)
    name: str = Field(..., max_length=200)

    phone: str | None = Field(None, max_length=32)
    email: str | None = Field(None, max_length=200)
    address: str | None = None

    contact_name: str | None = Field(None, max_length=200)
    tax_code: str | None = Field(None, max_length=64)

    bank_name: str | None = Field(None, max_length=200)
    bank_account: str | None = Field(None, max_length=64)
    bank_branch: str | None = Field(None, max_length=200)

    debt: Decimal = Field(Decimal("0"), ge=0)
    note: str | None = None
    is_active: bool = True


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    code: str | None = Field(None, max_length=64)
    name: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=32)
    email: str | None = Field(None, max_length=200)
    address: str | None = None
    contact_name: str | None = Field(None, max_length=200)
    tax_code: str | None = Field(None, max_length=64)
    bank_name: str | None = Field(None, max_length=200)
    bank_account: str | None = Field(None, max_length=64)
    bank_branch: str | None = Field(None, max_length=200)
    debt: Decimal | None = Field(None, ge=0)
    note: str | None = None
    is_active: bool | None = None


class SupplierOut(SupplierBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

