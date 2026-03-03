from pydantic import BaseModel
from typing import Literal
from decimal import Decimal
from datetime import datetime
from pydantic import Field

class OrderCreate(BaseModel):
    note: str | None = None

class OrderOut(BaseModel):
    id: int
    status: Literal["draft","checked_out","cancelled","voided"]
    customer_id: int | None = None
    note: str | None
    subtotal: Decimal
    discount_mode: Literal["amount","percent"]
    discount_value: Decimal
    discount_total: Decimal
    grand_total: Decimal
    created_at: datetime
    updated_at: datetime
    payment_method: str | None = None
    paid_amount: Decimal | None = None
    change_amount: Decimal | None = None
    checked_out_at: datetime | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    
    class Config:
        from_attributes = True

class OrderCheckoutIn(BaseModel):
    payment_method: Literal["cash","bank","momo"]
    paid_amount: Decimal
    note: str | None = None

class OrderUpdate(BaseModel):
    note: str | None = None
    customer_id: int | None = None
    # Backward compatible: if provided, treat as amount discount.
    discount_total: Decimal | None = Field(None, ge=0)
    # New: store discount intent (amount or percent).
    discount_mode: Literal["amount","percent"] | None = None
    discount_value: Decimal | None = Field(None, ge=0)


class OrderRefundItemIn(BaseModel):
    item_id: int
    qty: Decimal = Field(..., gt=0)


class OrderRefundIn(BaseModel):
    items: list[OrderRefundItemIn] = Field(..., min_length=1)
    note: str | None = None


class OrderRefundLineOut(BaseModel):
    item_id: int
    refunded_qty: Decimal
    refund_amount: Decimal


class OrderRefundOut(BaseModel):
    order_id: int
    refund_total: Decimal
    lines: list[OrderRefundLineOut]
