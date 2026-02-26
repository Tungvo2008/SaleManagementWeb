from pydantic import BaseModel, Field

class LocationBase(BaseModel):
    name: str | None = Field(..., max_length=200)
    note: str | None = None
    code: str = Field(..., max_length=200)

class LocationCreate(LocationBase):
    pass

class LocationUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    note: str | None = None
    code: str | None = Field(None, max_length=200)

class LocationOut(LocationBase):
    id: int

    class Config:
        from_attributes = True
