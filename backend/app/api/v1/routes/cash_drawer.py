from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import current_user
from app.db.deps import get_db
from app.models.cash_drawer_entry import CashDrawerEntry
from app.models.cash_drawer_session import CashDrawerSession
from app.models.user import User
from app.schemas.cash_drawer import (
    CashDrawerCloseIn,
    CashDrawerEntryOut,
    CashDrawerManagerWithdrawIn,
    CashDrawerOpenIn,
    CashDrawerSessionOut,
)


router = APIRouter(prefix="/cash-drawer")
UTC_TZ = ZoneInfo("UTC")


def _to_decimal(v) -> Decimal:
    if v is None:
        return Decimal("0")
    return Decimal(str(v))


def _get_open_session(db: Session) -> CashDrawerSession | None:
    return db.scalars(
        select(CashDrawerSession)
        .where(CashDrawerSession.status == "open")
        .order_by(CashDrawerSession.id.desc())
    ).first()


def _get_entries(db: Session, session_id: int, limit: int = 100) -> list[CashDrawerEntry]:
    return list(
        db.scalars(
            select(CashDrawerEntry)
            .where(CashDrawerEntry.session_id == session_id)
            .order_by(CashDrawerEntry.id.desc())
            .limit(max(1, min(limit, 500)))
        ).all()
    )


def _session_out(db: Session, obj: CashDrawerSession, include_entries: bool, entry_limit: int) -> CashDrawerSessionOut:
    opened_by = db.get(User, obj.opened_by_user_id)
    closed_by = db.get(User, obj.closed_by_user_id) if obj.closed_by_user_id is not None else None

    entries_out: list[CashDrawerEntryOut] = []
    if include_entries:
        entries = _get_entries(db, obj.id, limit=entry_limit)
        entries_out = [
            CashDrawerEntryOut(
                id=e.id,
                session_id=e.session_id,
                entry_type=e.entry_type,
                delta_cash=_to_decimal(e.delta_cash),
                note=e.note,
                order_id=e.order_id,
                created_at=e.created_at,
                created_by_user_id=e.created_by_user_id,
            )
            for e in entries
        ]

    return CashDrawerSessionOut(
        id=obj.id,
        status=obj.status,
        opening_cash=_to_decimal(obj.opening_cash),
        expected_cash=_to_decimal(obj.expected_cash),
        counted_cash=None if obj.counted_cash is None else _to_decimal(obj.counted_cash),
        variance=None if obj.variance is None else _to_decimal(obj.variance),
        note=obj.note,
        opened_at=obj.opened_at,
        closed_at=obj.closed_at,
        opened_by_user_id=obj.opened_by_user_id,
        closed_by_user_id=obj.closed_by_user_id,
        opened_by_username=None if opened_by is None else opened_by.username,
        closed_by_username=None if closed_by is None else closed_by.username,
        entries=entries_out,
    )


@router.get("/current", response_model=CashDrawerSessionOut)
def get_current_session(
    include_entries: bool = False,
    entry_limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    obj = _get_open_session(db)
    if obj is None:
        raise HTTPException(404, "Cash drawer is not open")
    return _session_out(db, obj, include_entries=include_entries, entry_limit=entry_limit)


@router.get("/sessions", response_model=list[CashDrawerSessionOut])
def list_sessions(
    status: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = select(CashDrawerSession)
    if status:
        q = q.where(CashDrawerSession.status == status)
    rows = db.scalars(q.order_by(CashDrawerSession.id.desc()).limit(limit)).all()
    return [_session_out(db, r, include_entries=False, entry_limit=0) for r in rows]


@router.get("/sessions/{session_id}", response_model=CashDrawerSessionOut)
def get_session(
    session_id: int,
    include_entries: bool = True,
    entry_limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    obj = db.get(CashDrawerSession, session_id)
    if obj is None:
        raise HTTPException(404, "Cash drawer session not found")
    return _session_out(
        db,
        obj,
        include_entries=include_entries,
        entry_limit=entry_limit,
    )


@router.post("/open", response_model=CashDrawerSessionOut)
def open_session(payload: CashDrawerOpenIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    existing = _get_open_session(db)
    if existing is not None:
        raise HTTPException(409, "Cash drawer is already open")

    obj = CashDrawerSession(
        status="open",
        opening_cash=payload.opening_cash,
        expected_cash=payload.opening_cash,
        note=payload.note,
        opened_by_user_id=user.id,
    )
    db.add(obj)
    db.flush()

    db.add(
        CashDrawerEntry(
            session_id=obj.id,
            entry_type="opening",
            delta_cash=payload.opening_cash,
            note=payload.note,
            order_id=None,
            created_by_user_id=user.id,
        )
    )
    db.commit()
    db.refresh(obj)
    return _session_out(db, obj, include_entries=True, entry_limit=100)


@router.post("/current/manager-withdraw", response_model=CashDrawerSessionOut)
def manager_withdraw(
    payload: CashDrawerManagerWithdrawIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if user.role not in {"admin", "manager"}:
        raise HTTPException(403, "Only manager/admin can withdraw cash")

    obj = _get_open_session(db)
    if obj is None:
        raise HTTPException(409, "Cash drawer is not open")

    expected = _to_decimal(obj.expected_cash)
    if payload.amount > expected:
        raise HTTPException(409, "Insufficient drawer cash")

    obj.expected_cash = expected - payload.amount
    db.add(
        CashDrawerEntry(
            session_id=obj.id,
            entry_type="manager_withdraw",
            delta_cash=payload.amount * Decimal("-1"),
            note=payload.note,
            order_id=None,
            created_by_user_id=user.id,
        )
    )
    db.commit()
    db.refresh(obj)
    return _session_out(db, obj, include_entries=True, entry_limit=100)


@router.post("/current/close", response_model=CashDrawerSessionOut)
def close_session(payload: CashDrawerCloseIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    obj = _get_open_session(db)
    if obj is None:
        raise HTTPException(409, "Cash drawer is not open")

    expected = _to_decimal(obj.expected_cash)
    counted = _to_decimal(payload.counted_cash)
    variance = counted - expected

    obj.status = "closed"
    # Store as naive UTC to match SQLite timestamps used across the project.
    obj.closed_at = datetime.now(UTC_TZ).replace(tzinfo=None)
    obj.closed_by_user_id = user.id
    obj.counted_cash = counted
    obj.variance = variance
    if payload.note:
        obj.note = payload.note

    db.add(
        CashDrawerEntry(
            session_id=obj.id,
            entry_type="closing",
            delta_cash=Decimal("0"),
            note=payload.note,
            order_id=None,
            created_by_user_id=user.id,
        )
    )
    db.commit()
    db.refresh(obj)
    return _session_out(db, obj, include_entries=True, entry_limit=100)
