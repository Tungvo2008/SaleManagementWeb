from __future__ import annotations

from datetime import date as date_type
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.order import Order
from app.schemas.report import DailyReportOut, PaymentBreakdownOut


router = APIRouter(prefix="/reports")

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
UTC_TZ = ZoneInfo("UTC")


@router.get("/daily", response_model=DailyReportOut)
def daily_report(date: date_type | None = None, db: Session = Depends(get_db)):
    """
    Daily sales report (Vietnam local day) for checked-out orders.
    Query param format: YYYY-MM-DD
    """
    if date is None:
        date = datetime.now(VN_TZ).date()

    # We store checked_out_at as a naive UTC datetime (set via datetime.utcnow()).
    # Convert Vietnam day boundaries -> UTC naive for filtering.
    start_local = datetime.combine(date, time.min, tzinfo=VN_TZ)
    end_local = start_local + timedelta(days=1)

    start_utc = start_local.astimezone(UTC_TZ).replace(tzinfo=None)
    end_utc = end_local.astimezone(UTC_TZ).replace(tzinfo=None)

    where = (
        Order.status == "checked_out",
        Order.checked_out_at.is_not(None),
        Order.checked_out_at >= start_utc,
        Order.checked_out_at < end_utc,
    )

    totals_q = select(
        func.count(Order.id).label("orders_count"),
        func.coalesce(func.sum(Order.subtotal), 0).label("subtotal_total"),
        func.coalesce(func.sum(Order.discount_total), 0).label("discount_total"),
        func.coalesce(func.sum(Order.grand_total), 0).label("grand_total"),
    ).where(*where)

    totals = db.execute(totals_q).mappings().one()

    by_payment_q = (
        select(
            func.coalesce(Order.payment_method, "unknown").label("payment_method"),
            func.count(Order.id).label("orders_count"),
            func.coalesce(func.sum(Order.grand_total), 0).label("total"),
        )
        .where(*where)
        .group_by(func.coalesce(Order.payment_method, "unknown"))
        .order_by(func.coalesce(Order.payment_method, "unknown").asc())
    )

    rows = db.execute(by_payment_q).mappings().all()

    # SQLite/SQLAlchemy may return int for coalesce(0); normalize to Decimal via str.
    def _d(v: object) -> Decimal:
        return Decimal(str(v))

    by_payment = [
        PaymentBreakdownOut(
            payment_method=str(r["payment_method"]),
            orders_count=int(r["orders_count"]),
            total=_d(r["total"]),
        )
        for r in rows
    ]

    return DailyReportOut(
        date=date,
        orders_count=int(totals["orders_count"]),
        subtotal_total=_d(totals["subtotal_total"]),
        discount_total=_d(totals["discount_total"]),
        grand_total=_d(totals["grand_total"]),
        by_payment=by_payment,
    )
