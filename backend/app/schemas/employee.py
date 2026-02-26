from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class EmployeeCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=200)
    role: Literal["admin", "manager", "cashier"] = "cashier"
    is_active: bool = True


class EmployeeUpdate(BaseModel):
    username: str | None = Field(None, min_length=3, max_length=64)
    password: str | None = Field(None, min_length=6, max_length=200)
    role: Literal["admin", "manager", "cashier"] | None = None
    is_active: bool | None = None


class EmployeeOut(BaseModel):
    id: int
    username: str
    role: Literal["admin", "manager", "cashier"]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
