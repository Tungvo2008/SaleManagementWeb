from __future__ import annotations

from decimal import Decimal
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class InventoryBase(BaseModel):
    variant_id: int
    stock_unit_id: int | None = None
    from_location_id: int | None = None
    to_location_id: int | None = None
    supplier_id: int | None = None
    qty: Decimal
    note: str | None = None


class InventoryReceiveCreate(BaseModel):
    type: Literal["receive"] = "receive"
    variant_id: int
    supplier_id: int | None = None
    qty: Decimal
    cost_price: Decimal | None = None
    note: str | None = None


class InventorySaleCreate(BaseModel):
    type: Literal["sale"] = "sale"
    variant_id: int
    stock_unit_id: int | None = None
    qty: Decimal
    note: str | None = None


class InventoryTransferCreate(BaseModel):
    type: Literal["transfer"] = "transfer"
    stock_unit_id: int
    to_location_id: int
    note: str | None = None


class InventoryAdjustCreate(BaseModel):
    type: Literal["adjust"] = "adjust"
    variant_id: int
    stock_unit_id: int | None = None
    qty: Decimal  # delta (+/-)
    note: str | None = None

class InventoryQueryOut(BaseModel):
    variant_id: int
    parent_id: int | None
    parent_name: str | None
    sku: str | None
    name: str
    uom: str | None
    stock: Decimal
    cost_price: Decimal | None = None
    # Only meaningful for variants with track_stock_unit=True (e.g. roll goods)
    rolls_total: int = 0
    rolls_full: int = 0
    rolls_partial: int = 0



class InventoryOut(InventoryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryReceiveHistoryOut(BaseModel):
    id: int
    created_at: datetime
    variant_id: int
    variant_name: str
    sku: str | None = None
    uom: str | None = None
    stock_unit_id: int | None = None
    qty: Decimal
    supplier_id: int | None = None
    supplier_name: str | None = None
    note: str | None = None
