from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import uuid4

from fastapi import Request
from sqlalchemy import event
from sqlalchemy.inspection import inspect as sa_inspect

from app.core.security import decode_and_verify_jwt
from app.db.base import Base
from app.models.audit_log import AuditLog


@dataclass
class AuditContext:
    request_id: str | None = None
    actor_user_id: int | None = None
    actor_username: str | None = None
    method: str | None = None
    path: str | None = None
    module: str | None = None


_AUDIT_CTX: ContextVar[AuditContext] = ContextVar("audit_ctx", default=AuditContext())


def _set_ctx(ctx: AuditContext):
    return _AUDIT_CTX.set(ctx)


def _reset_ctx(token) -> None:
    _AUDIT_CTX.reset(token)


def _get_ctx() -> AuditContext:
    return _AUDIT_CTX.get()


def _module_from_path(path: str) -> str | None:
    parts = [p for p in path.split("/") if p]
    # /api/v1/{module}/...
    if len(parts) >= 3 and parts[0] == "api" and parts[1] == "v1":
        return parts[2]
    return parts[0] if parts else None


def _decode_actor(request: Request) -> tuple[int | None, str | None]:
    raw = request.cookies.get("access_token")
    if not raw:
        return None, None
    try:
        payload = decode_and_verify_jwt(raw)
    except ValueError:
        return None, None

    uid = None
    sub = payload.get("sub")
    if sub is not None and str(sub).isdigit():
        uid = int(sub)

    username = payload.get("usr")
    if username is not None:
        username = str(username).strip() or None
    return uid, username


async def audit_context_middleware(request: Request, call_next):
    actor_user_id, actor_username = _decode_actor(request)
    token = _set_ctx(
        AuditContext(
            request_id=uuid4().hex,
            actor_user_id=actor_user_id,
            actor_username=actor_username,
            method=request.method,
            path=request.url.path,
            module=_module_from_path(request.url.path),
        )
    )
    try:
        response = await call_next(request)
    finally:
        _reset_ctx(token)
    return response


def _serialize(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Enum):
        return _serialize(value.value)
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, dict):
        return {str(k): _serialize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_serialize(v) for v in value]
    return str(value)


def _column_map(target: Any) -> dict[str, Any]:
    state = sa_inspect(target)
    out: dict[str, Any] = {}
    for attr in state.mapper.column_attrs:
        key = attr.key
        out[key] = _serialize(getattr(target, key, None))
    return out


def _pk_string(target: Any) -> str | None:
    state = sa_inspect(target)
    parts: list[str] = []
    for col in state.mapper.primary_key:
        val = getattr(target, col.key, None)
        if val is None:
            return None
        parts.append(str(val))
    if not parts:
        return None
    return parts[0] if len(parts) == 1 else "|".join(parts)


def _entity_label(data: dict[str, Any] | None) -> str | None:
    if not data:
        return None
    for key in ("name", "sku", "barcode", "code", "title", "username"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:255]
    if data.get("id") is not None:
        return str(data["id"])[:255]
    return None


def _write_log(connection, target: Any, *, action: str, before_data: dict[str, Any] | None, after_data: dict[str, Any] | None, changed_fields: list[str] | None) -> None:
    if isinstance(target, AuditLog):
        return

    table = getattr(target, "__tablename__", None)
    if table is None or table == "audit_logs":
        return

    ctx = _get_ctx()
    label_src = after_data or before_data
    connection.execute(
        AuditLog.__table__.insert().values(
            actor_user_id=ctx.actor_user_id,
            actor_username=ctx.actor_username,
            request_id=ctx.request_id,
            method=ctx.method,
            path=ctx.path,
            module=ctx.module,
            entity_type=table,
            entity_id=_pk_string(target),
            entity_label=_entity_label(label_src),
            action=action,
            changed_fields=changed_fields,
            before_data=before_data,
            after_data=after_data,
        )
    )


@event.listens_for(Base, "after_insert", propagate=True)
def _audit_after_insert(mapper, connection, target) -> None:
    _write_log(
        connection,
        target,
        action="create",
        before_data=None,
        after_data=_column_map(target),
        changed_fields=None,
    )


@event.listens_for(Base, "after_update", propagate=True)
def _audit_after_update(mapper, connection, target) -> None:
    state = sa_inspect(target)
    before_data: dict[str, Any] = {}
    after_data: dict[str, Any] = {}
    changed_fields: list[str] = []

    for attr in state.mapper.column_attrs:
        key = attr.key
        hist = state.attrs[key].history
        if not hist.has_changes():
            continue
        changed_fields.append(key)
        old_v = hist.deleted[0] if hist.deleted else None
        new_v = hist.added[0] if hist.added else getattr(target, key, None)
        before_data[key] = _serialize(old_v)
        after_data[key] = _serialize(new_v)

    if not changed_fields:
        return

    _write_log(
        connection,
        target,
        action="update",
        before_data=before_data,
        after_data=after_data,
        changed_fields=changed_fields,
    )


@event.listens_for(Base, "after_delete", propagate=True)
def _audit_after_delete(mapper, connection, target) -> None:
    _write_log(
        connection,
        target,
        action="delete",
        before_data=_column_map(target),
        after_data=None,
        changed_fields=None,
    )
