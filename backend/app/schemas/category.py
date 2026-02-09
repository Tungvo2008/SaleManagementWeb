from pydantic import BaseModel, Field

class CategoryBase(BaseModel):
    name: str = Field(..., max_length=200)
    description: str | None = None
    image_url: str | None = Field(None, max_length=500)

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    description: str | None = None
    image_url: str | None = Field(None, max_length=500)

class CategoryOut(CategoryBase):
    id: int

    class Config:
        from_attributes = True
