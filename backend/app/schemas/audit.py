from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    actor_user_id: int | None = None
    actor_username: str | None = None
    request_id: str | None = None
    method: str | None = None
    path: str | None = None
    module: str | None = None
    entity_type: str
    entity_id: str | None = None
    entity_label: str | None = None
    action: str
    changed_fields: list[str] | None = None
    before_data: dict | None = None
    after_data: dict | None = None
    note: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
