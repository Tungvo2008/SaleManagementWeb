from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.price_history import PriceHistory
from app.models.stock_unit import StockUnit


def _to_decimal(value: Decimal | int | float | str | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _money2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def compute_moving_average_cost(
    *,
    current_cost: Decimal | None,
    current_qty: Decimal,
    received_cost: Decimal | None,
    received_qty: Decimal,
) -> Decimal | None:
    """
    Perpetual weighted average cost:
      new_avg = (old_avg * old_qty + in_cost * in_qty) / (old_qty + in_qty)
    """
    in_cost = _to_decimal(received_cost)
    if in_cost is None:
        return current_cost
    if in_cost < 0:
        raise ValueError("received_cost must be >= 0")
    if received_qty <= 0:
        return current_cost

    old_cost = _to_decimal(current_cost)
    if old_cost is None or current_qty <= 0:
        return _money2(in_cost)

    total_qty = current_qty + received_qty
    if total_qty <= 0:
        return _money2(in_cost)

    next_cost = ((old_cost * current_qty) + (in_cost * received_qty)) / total_qty
    return _money2(next_cost)


def record_price_change(
    db: Session,
    *,
    variant_id: int,
    field: str,
    old_value: Decimal | int | float | str | None,
    new_value: Decimal | int | float | str | None,
    source: str,
    stock_unit_id: int | None = None,
    note: str | None = None,
) -> None:
    old_d = _to_decimal(old_value)
    new_d = _to_decimal(new_value)
    if old_d == new_d:
        return

    db.add(
        PriceHistory(
            variant_id=variant_id,
            stock_unit_id=stock_unit_id,
            field=field,
            old_value=old_d,
            new_value=new_d,
            source=source,
            note=note,
        )
    )


def recompute_variant_cost_from_stock_units(db: Session, *, variant_id: int) -> Decimal | None:
    """
    Weighted average by current on-hand quantity from stock_units.
    Ignores rows with NULL cost_per_m.
    """
    row = db.execute(
        select(
            func.coalesce(func.sum(StockUnit.remaining_qty), 0).label("total_qty"),
            func.coalesce(func.sum(StockUnit.remaining_qty * StockUnit.cost_per_m), 0).label("total_cost"),
        ).where(
            StockUnit.variant_id == variant_id,
            StockUnit.remaining_qty > 0,
            StockUnit.cost_per_m.is_not(None),
        )
    ).mappings().one()

    total_qty = _to_decimal(row["total_qty"]) or Decimal("0")
    total_cost = _to_decimal(row["total_cost"]) or Decimal("0")
    if total_qty <= 0:
        return None
    return _money2(total_cost / total_qty)
