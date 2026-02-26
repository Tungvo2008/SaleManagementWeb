from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


PricingMode = Literal["meter", "roll"]


class PosQuoteIn(BaseModel):
    barcode: str = Field(..., min_length=1, max_length=200)
    mode: PricingMode = "meter"
    qty: Decimal | None = None  # only used for mode="meter"


class PosQuoteOut(BaseModel):
    variant_id: int
    stock_unit_id: int
    sku: str | None
    name: str

    mode: PricingMode
    sell_uom: Literal["m", "roll"]

    qty_sell: Decimal  # qty in sell_uom (m for meter, 1 for roll)
    qty_inventory_m: Decimal  # how many meters will be deducted from inventory

    price_per_m: Decimal
    roll_price: Decimal | None = None
    unit_price: Decimal  # price per sell_uom (per m, or per roll)
    line_total: Decimal

    meters_per_roll: Decimal
    is_full_roll: bool

