from pydantic import BaseModel, Field
from decimal import Decimal
from typing import Literal

class OrderItemCreateNormal(BaseModel):
    variant_id: int
    qty: Decimal = Field(..., gt=0)


class OrderItemCreateManual(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    unit_price: Decimal = Field(..., ge=0)
    qty: Decimal = Field(..., gt=0)

class OrderItemUpdateNormal(BaseModel):
    qty: Decimal = Field(..., gt=0)
    name: str | None = Field(None, min_length=1, max_length=255)
    unit_price: Decimal | None = Field(None, ge=0)



class OrderItemCreateRoll(BaseModel):
    barcode: str
    mode: Literal["meter","roll"]
    qty: Decimal | None = Field(None, gt=0)

class OrderItemUpdateRoll(BaseModel):
    mode: Literal["meter","roll"] | None = None
    qty: Decimal | None = Field(None, gt=0)

class OrderItemOut(BaseModel):
    id: int
    order_id: int
    variant_id: int | None
    stock_unit_id: int | None
    pricing_mode: Literal["normal","meter","roll"]
    qty: Decimal
    unit_price: Decimal
    discount_mode: Literal["amount","percent"] | None = None
    discount_value: Decimal | None = None
    discount_total: Decimal
    line_total: Decimal
    name_snapshot: str
    sku_snapshot: str | None
    uom_snapshot: str | None
    class Config:
        from_attributes = True


class OrderItemDiscountUpdate(BaseModel):
    # "none" clears discount for this line
    mode: Literal["none","amount","percent"]
    value: Decimal | None = Field(None, ge=0)
