from __future__ import annotations

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=200)


class UserOut(BaseModel):
    id: int
    username: str
    role: str

    class Config:
        from_attributes = True

