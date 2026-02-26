from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.product import Product, is_sellable_product
from app.models.stock_unit import StockUnit
from app.schemas.pos import PosQuoteIn, PosQuoteOut

router = APIRouter()


def _to_decimal(v: object, *, field: str) -> Decimal:
    try:
        return Decimal(str(v))
    except Exception:
        raise HTTPException(422, f"{field} must be a number")


@router.post("/quote", response_model=PosQuoteOut)
def quote(payload: PosQuoteIn, db: Session = Depends(get_db)):
    su = db.scalars(select(StockUnit).where(StockUnit.barcode == payload.barcode)).first()
    if su is None:
        raise HTTPException(404, "Stock unit not found")

    v = db.get(Product, su.variant_id)
    if not is_sellable_product(v):
        raise HTTPException(404, "Variant not found")
    if not v.is_active:
        raise HTTPException(422, "Variant is inactive")
    if not v.track_stock_unit:
        raise HTTPException(422, "This variant does not track stock units")
    if (v.uom or "m") != "m":
        raise HTTPException(422, "Only meter-based roll goods are supported for POS quoting")

    attrs = v.attrs or {}
    if not isinstance(attrs, dict):
        raise HTTPException(422, "variant.attrs must be an object")

    meters_per_roll_raw = attrs.get("meters_per_roll")
    if meters_per_roll_raw is None:
        raise HTTPException(422, "Missing variant.attrs.meters_per_roll")
    meters_per_roll = _to_decimal(meters_per_roll_raw, field="meters_per_roll")
    if meters_per_roll <= 0:
        raise HTTPException(422, "meters_per_roll must be > 0")

    # Treat Product.price as the per-meter price for roll goods
    if v.price is None:
        raise HTTPException(422, "Missing variant.price (price per meter)")
    price_per_m = _to_decimal(v.price, field="price_per_m")
    if price_per_m < 0:
        raise HTTPException(422, "price_per_m must be >= 0")

    roll_price = None
    if v.roll_price is not None:
        roll_price = _to_decimal(v.roll_price, field="roll_price")
        if roll_price < 0:
            raise HTTPException(422, "roll_price must be >= 0")

    is_full_roll = (su.remaining_qty == su.initial_qty) and (su.remaining_qty > 0)

    if payload.mode == "roll":
        if not is_full_roll:
            raise HTTPException(409, "This roll is not full; cannot sell as roll-price")

        qty_inventory_m = su.remaining_qty
        qty_sell = Decimal("1")
        sell_uom = "roll"

        unit_price = roll_price if roll_price is not None else (price_per_m * qty_inventory_m)
        line_total = unit_price

    else:
        if payload.qty is None:
            raise HTTPException(422, "qty is required for mode=meter")
        qty_inventory_m = payload.qty
        if qty_inventory_m <= 0:
            raise HTTPException(422, "qty must be > 0")
        if su.remaining_qty < qty_inventory_m:
            raise HTTPException(409, "Insufficient stock in this roll")

        qty_sell = qty_inventory_m
        sell_uom = "m"
        unit_price = price_per_m
        line_total = qty_sell * unit_price

    return PosQuoteOut(
        variant_id=v.id,
        stock_unit_id=su.id,
        sku=v.sku,
        name=v.name,
        mode=payload.mode,
        sell_uom=sell_uom,
        qty_sell=qty_sell,
        qty_inventory_m=qty_inventory_m,
        price_per_m=price_per_m,
        roll_price=roll_price,
        unit_price=unit_price,
        line_total=line_total,
        meters_per_roll=meters_per_roll,
        is_full_roll=is_full_roll,
    )
