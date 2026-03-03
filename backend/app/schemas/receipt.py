from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

class ReceiptItemOut(BaseModel):
    item_id: int
    name: str
    sku: str | None
    pricing_mode: Literal["normal", "meter", "roll"]
    qty: Decimal
    uom: str | None
    unit_price: Decimal
    discount_mode: Literal["amount","percent"] | None = None
    discount_value: Decimal | None = None
    discount_total: Decimal
    line_total: Decimal
    refunded_qty: Decimal = Decimal("0")
    refundable_qty: Decimal = Decimal("0")
    barcode: str | None

class ReceiptOut(BaseModel):
    order_id: int
    status: Literal["draft","checked_out","cancelled","voided"]
    customer_id: int | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    created_at: datetime
    items: list[ReceiptItemOut]
    subtotal: Decimal
    discount_total: Decimal
    grand_total: Decimal
