from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import current_user
from app.db.deps import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogOut


router = APIRouter(prefix="/audit")


@router.get("/events", response_model=list[AuditLogOut])
def list_audit_events(
    entity_type: str | None = None,
    entity_id: str | None = None,
    request_id: str | None = None,
    module: str | None = None,
    action: str | None = None,
    actor_user_id: int | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    qx = select(AuditLog).order_by(AuditLog.id.desc())

    if entity_type:
        qx = qx.where(AuditLog.entity_type == entity_type.strip())
    if entity_id:
        qx = qx.where(AuditLog.entity_id == entity_id.strip())
    if request_id:
        qx = qx.where(AuditLog.request_id == request_id.strip())
    if module:
        qx = qx.where(AuditLog.module == module.strip())
    if action:
        qx = qx.where(AuditLog.action == action.strip())
    if actor_user_id is not None:
        qx = qx.where(AuditLog.actor_user_id == actor_user_id)
    if date_from is not None:
        qx = qx.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        qx = qx.where(AuditLog.created_at <= date_to)

    if q and q.strip():
        like = f"%{q.strip()}%"
        qx = qx.where(
            or_(
                AuditLog.entity_label.ilike(like),
                AuditLog.path.ilike(like),
                AuditLog.module.ilike(like),
                AuditLog.entity_type.ilike(like),
                AuditLog.entity_id.ilike(like),
                AuditLog.actor_username.ilike(like),
                AuditLog.note.ilike(like),
            )
        )

    safe_limit = max(1, min(int(limit or 200), 2000))
    qx = qx.limit(safe_limit)

    return list(db.scalars(qx).all())
