from decimal import Decimal
from pydantic import BaseModel, Field, condecimal, conint

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
    price: condecimal(max_digits=12, decimal_places=2)  # bắt buộc
    stock: conint(ge=0)  # bắt buộc
    sku: str | None = Field(None, max_length=64)
    image_url: str | None = Field(None, max_length=500)
    attrs: dict | None = None
    is_active: bool = True

class VariantUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    price: condecimal(max_digits=12, decimal_places=2) | None = None
    stock: conint(ge=0) | None = None
    sku: str | None = Field(None, max_length=64)
    image_url: str | None = Field(None, max_length=500)
    attrs: dict | None = None
    is_active: bool | None = None

# ---------- Outputs ----------
class VariantOut(BaseModel):
    id: int
    parent_id: int
    name: str
    price: Decimal | None = None
    stock: int | None = None
    sku: str | None = None
    image_url: str | None = None
    attrs: dict | None = None
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
