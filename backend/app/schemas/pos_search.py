from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class PosSearchVariantOut(BaseModel):
    variant_id: int
    parent_id: int | None
    parent_name: str | None
    parent_category_id: int | None = None
    parent_category_name: str | None = None
    sku: str | None
    barcode: str | None = None
    name: str
    image_url: str | None = None
    uom: str | None
    price: Decimal | None
    roll_price: Decimal | None
    track_stock_unit: bool
    stock: Decimal
    rolls_total: int = 0
    rolls_full: int = 0
    rolls_partial: int = 0


class PosSearchStockUnitOut(BaseModel):
    stock_unit_id: int
    barcode: str
    variant_id: int
    sku: str | None
    variant_name: str
    uom: str | None
    price: Decimal | None
    roll_price: Decimal | None
    remaining_qty: Decimal
    initial_qty: Decimal
    is_full_roll: bool
    location_id: int | None
    is_reserved: bool


class PosSearchOut(BaseModel):
    q: str
    stock_unit: PosSearchStockUnitOut | None = None
    # Convenience for scan flow of normal goods (barcode/sku):
    # if q matches a variant barcode/sku exactly, return that variant here so the UI
    # can "add 1 item" immediately without guessing from the variants list.
    exact_variant: PosSearchVariantOut | None = None
    variants: list[PosSearchVariantOut] = Field(default_factory=list)
