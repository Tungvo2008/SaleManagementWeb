from decimal import Decimal
from pydantic import BaseModel, Field, condecimal

# ---------- Parent ----------
class ParentCreate(BaseModel):
    name: str = Field(..., max_length=255)
    description: str | None = None
    image_url: str | None = Field(None, max_length=500)
    category_id: int | None = None

class ParentUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    description: str | None = None
    image_url: str | None = Field(None, max_length=500)
    category_id: int | None = None
    is_active: bool | None = None

# ---------- Variant (Child) ----------
class VariantCreate(BaseModel):
    name: str = Field(..., max_length=255)  # ví dụ: "Đỏ - Size M"
    description: str | None = None
    category_id: int | None = None
    price: condecimal(max_digits=12, decimal_places=2)  # bắt buộc
    roll_price: condecimal(max_digits=12, decimal_places=2) | None = None
    cost_price: condecimal(max_digits=12, decimal_places=2, ge=0) | None = None
    uom: str = Field(..., max_length=64)
    stock: condecimal(max_digits=12, decimal_places=2, ge=0)  # bắt buộc (có thể lẻ: mét/kg/...)
    sku: str = Field(..., max_length=64)
    barcode: str | None = Field(None, max_length=64)
    image_url: str | None = Field(None, max_length=500)
    attrs: dict | None = None
    track_stock_unit: bool = False
    is_active: bool = True

class VariantUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    description: str | None = None
    category_id: int | None = None
    price: condecimal(max_digits=12, decimal_places=2) | None = None
    roll_price: condecimal(max_digits=12, decimal_places=2) | None = None
    cost_price: condecimal(max_digits=12, decimal_places=2, ge=0) | None = None
    uom: str | None = Field(None, max_length=64)
    stock: condecimal(max_digits=12, decimal_places=2, ge=0) | None = None
    sku: str | None = Field(None, max_length=64)
    barcode: str | None = Field(None, max_length=64)
    image_url: str | None = Field(None, max_length=500)
    attrs: dict | None = None
    track_stock_unit: bool | None = None
    is_active: bool | None = None

# ---------- Outputs ----------
class VariantOut(BaseModel):
    id: int
    parent_id: int | None = None
    category_id: int | None = None
    name: str
    description: str | None = None
    price: Decimal | None = None
    roll_price: Decimal | None = None
    cost_price: Decimal | None = None
    uom: str | None = None
    stock: Decimal | None = None
    sku: str | None = None
    barcode: str | None = None
    image_url: str | None = None
    attrs: dict | None = None
    track_stock_unit: bool
    is_active: bool

    class Config:
        from_attributes = True

class ParentOut(BaseModel):
    id: int
    parent_id: None = None
    category_id: int | None = None
    name: str
    description: str | None = None
    image_url: str | None = None
    is_active: bool

    class Config:
        from_attributes = True

class ParentWithVariants(ParentOut):
    variants: list[VariantOut] = []

    class Config:
        from_attributes = True
