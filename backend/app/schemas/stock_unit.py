from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class StockUnitBase(BaseModel):
    variant_id: int
    barcode: str | None = None
    location_id: int | None = None
    uom: str
    initial_qty: Decimal
    remaining_qty: Decimal
    cost_roll_price: Decimal | None = None
    cost_per_m: Decimal | None = None
    is_depleted: bool = Field(False)


class StockUnitCreate(BaseModel):
    variant_id: int
    initial_qty: Decimal
    remaining_qty: Decimal
    uom: str
    barcode: str | None = None
    location_id: int | None = None
    cost_roll_price: Decimal | None = None
    cost_per_m: Decimal | None = None


class StockUnitReceiveRollsCreate(BaseModel):
    variant_id: int
    roll_count: int = Field(..., ge=1)
    location_id: int | None = None
    supplier_id: int | None = None
    cost_roll_price: Decimal | None = None
    cost_per_m: Decimal | None = None
    note: str | None = None


class StockUnitUpdate(BaseModel):
    variant_id: int | None = None
    barcode: str | None = None
    location_id: int | None = None
    uom: str | None = None
    initial_qty: Decimal | None = None
    remaining_qty: Decimal | None = None
    cost_roll_price: Decimal | None = None
    cost_per_m: Decimal | None = None


class StockUnitOut(StockUnitBase):
    id: int

    class Config:
        from_attributes = True
