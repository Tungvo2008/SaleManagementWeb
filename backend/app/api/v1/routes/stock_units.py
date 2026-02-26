from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.deps import get_db
from app.models.stock_unit import StockUnit
from app.models.product import Product, is_sellable_product
from app.models.location import Location
from app.models.inventory import Inventory
from app.models.supplier import Supplier
from app.services.pricing import (
    compute_moving_average_cost,
    record_price_change,
    recompute_variant_cost_from_stock_units,
)
from app.schemas.stock_unit import (
    StockUnitCreate,
    StockUnitReceiveRollsCreate,
    StockUnitUpdate,
    StockUnitOut,
)

router = APIRouter()


def _resolve_unit_costs(
    *,
    initial_qty: Decimal,
    variant_cost_price: Decimal | None,
    cost_roll_price: Decimal | None,
    cost_per_m: Decimal | None,
) -> tuple[Decimal | None, Decimal | None]:
    """
    Resolve roll-level and per-meter import costs.
    Priority:
    1) payload values
    2) fallback from variant.cost_price
    """
    roll = cost_roll_price
    per_m = cost_per_m

    if roll is not None and roll < 0:
        raise HTTPException(422, "cost_roll_price must be >= 0")
    if per_m is not None and per_m < 0:
        raise HTTPException(422, "cost_per_m must be >= 0")

    if roll is None and per_m is None and variant_cost_price is not None:
        per_m = variant_cost_price

    if per_m is None and roll is not None:
        per_m = (roll / initial_qty) if initial_qty > 0 else None
    if roll is None and per_m is not None:
        roll = per_m * initial_qty

    return roll, per_m

@router.get("/", response_model=list[StockUnitOut])
def list_stock_units(
    variant_id: int | None = None, 
    location_id: int | None = None, 
    db : Session = Depends(get_db)
):

    q = select(StockUnit)

    if variant_id is not None: 
        q = q.where(StockUnit.variant_id ==variant_id)

    if location_id is not None:
        q = q.where(StockUnit.location_id == location_id)

    return list(db.scalars(q).all())


@router.post("/", response_model=StockUnitOut)
def create_stock_units(payload: StockUnitCreate, db: Session = Depends(get_db)):
    v = db.get(Product, payload.variant_id)
    if not is_sellable_product(v):
        raise HTTPException(404, "Variant not found")
    if not v.track_stock_unit:
        raise HTTPException(422, "This variant does not track stock units")
    if v.uom is not None and payload.uom != v.uom:
        raise HTTPException(422, "Stock unit uom must match variant uom")

    if payload.initial_qty <= 0 or payload.remaining_qty <= 0:
        raise HTTPException(422, "initial_qty and remaining_qty must be > 0")
    if payload.initial_qty != payload.remaining_qty:
        raise HTTPException(422, "initial_qty must equal remaining_qty when creating a stock unit")
    old_stock = v.stock or Decimal("0")
    old_variant_cost = v.cost_price
    if v.stock is None:
        v.stock = Decimal("0")

    cost_roll_price, cost_per_m = _resolve_unit_costs(
        initial_qty=payload.initial_qty,
        variant_cost_price=v.cost_price,
        cost_roll_price=payload.cost_roll_price,
        cost_per_m=payload.cost_per_m,
    )
    data = payload.model_dump()
    data["cost_roll_price"] = cost_roll_price
    data["cost_per_m"] = cost_per_m
    obj = StockUnit(**data)
    obj.is_depleted = obj.remaining_qty <= 0

    if obj.location_id is not None:
        exists = db.get(Location, obj.location_id)
        if not exists:
            raise HTTPException(404, "Location not found")

    db.add(obj)
    # Keep variant.stock as the sellable qty (e.g. meters) for stock-unit-tracked variants.
    v.stock += payload.remaining_qty
    if cost_per_m is not None:
        v.cost_price = compute_moving_average_cost(
            current_cost=v.cost_price,
            current_qty=old_stock,
            received_cost=cost_per_m,
            received_qty=payload.remaining_qty,
        )
    try:
        db.flush()
        record_price_change(
            db,
            variant_id=v.id,
            stock_unit_id=obj.id,
            field="cost_roll_price",
            old_value=None,
            new_value=cost_roll_price,
            source="stock_unit_create",
        )
        record_price_change(
            db,
            variant_id=v.id,
            stock_unit_id=obj.id,
            field="cost_per_m",
            old_value=None,
            new_value=cost_per_m,
            source="stock_unit_create",
        )
        record_price_change(
            db,
            variant_id=v.id,
            field="cost_price",
            old_value=old_variant_cost,
            new_value=v.cost_price,
            source="stock_unit_create",
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Barcode already exists")
    db.refresh(obj)
    return obj


@router.post("/receive-rolls", response_model=list[StockUnitOut])
def receive_rolls(payload: StockUnitReceiveRollsCreate, db: Session = Depends(get_db)):
    """
    Receive roll-goods by creating N StockUnit rows.
    - meters_per_roll is taken from variant.attrs["meters_per_roll"]
    - updates Product.stock (sellable meters) to keep POS/search fast
    - writes Inventory rows (type="receive") linked to each created stock unit
    """
    v = db.get(Product, payload.variant_id)
    if not is_sellable_product(v):
        raise HTTPException(404, "Variant not found")
    if not v.track_stock_unit:
        raise HTTPException(422, "This variant does not track stock units")

    attrs = v.attrs or {}
    if not isinstance(attrs, dict):
        raise HTTPException(422, "variant.attrs must be an object")
    mpr = attrs.get("meters_per_roll")
    if mpr is None:
        raise HTTPException(422, "Missing variant.attrs.meters_per_roll for roll receiving")

    try:
        meters_per_roll = Decimal(str(mpr))
    except Exception:
        raise HTTPException(422, "variant.attrs.meters_per_roll must be a number")
    if meters_per_roll <= 0:
        raise HTTPException(422, "meters_per_roll must be > 0")

    if payload.location_id is not None:
        exists = db.get(Location, payload.location_id)
        if not exists:
            raise HTTPException(404, "Location not found")

    if payload.supplier_id is not None:
        sup = db.get(Supplier, payload.supplier_id)
        if sup is None:
            raise HTTPException(404, "Supplier not found")

    uom = v.uom or "m"
    if v.uom is not None and v.uom != uom:
        # defensive; currently always true
        raise HTTPException(422, "Invalid variant uom")

    prefix = (v.sku or f"VAR{v.id}").replace(" ", "").upper()
    cost_roll_price, cost_per_m = _resolve_unit_costs(
        initial_qty=meters_per_roll,
        variant_cost_price=v.cost_price,
        cost_roll_price=payload.cost_roll_price,
        cost_per_m=payload.cost_per_m,
    )
    units: list[StockUnit] = []
    for _ in range(payload.roll_count):
        barcode = f"{prefix}-ROLL-{uuid4().hex[:10]}"
        units.append(
            StockUnit(
                variant_id=v.id,
                barcode=barcode,
                location_id=payload.location_id,
                uom=uom,
                initial_qty=meters_per_roll,
                remaining_qty=meters_per_roll,
                cost_roll_price=cost_roll_price,
                cost_per_m=cost_per_m,
                is_depleted=False,
            )
        )

    old_stock = v.stock or Decimal("0")
    old_variant_cost = v.cost_price
    total_received_qty = meters_per_roll * payload.roll_count
    if v.stock is None:
        v.stock = Decimal("0")
    v.stock += total_received_qty
    if cost_per_m is not None:
        v.cost_price = compute_moving_average_cost(
            current_cost=v.cost_price,
            current_qty=old_stock,
            received_cost=cost_per_m,
            received_qty=total_received_qty,
        )

    db.add_all(units)
    try:
        db.flush()  # assign ids for Inventory rows
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Barcode already exists (retry)")

    inv_rows = [
        Inventory(
            type="receive",
            variant_id=v.id,
            stock_unit_id=su.id,
            to_location_id=payload.location_id,
            supplier_id=payload.supplier_id,
            qty=meters_per_roll,
            note=payload.note,
        )
        for su in units
    ]
    db.add_all(inv_rows)

    record_price_change(
        db,
        variant_id=v.id,
        field="cost_roll_price",
        old_value=None,
        new_value=cost_roll_price,
        source="stock_units_receive_rolls",
        note=f"{payload.roll_count} cuộn",
    )
    record_price_change(
        db,
        variant_id=v.id,
        field="cost_per_m",
        old_value=None,
        new_value=cost_per_m,
        source="stock_units_receive_rolls",
        note=f"{payload.roll_count} cuộn",
    )
    record_price_change(
        db,
        variant_id=v.id,
        field="cost_price",
        old_value=old_variant_cost,
        new_value=v.cost_price,
        source="stock_units_receive_rolls",
        note=payload.note,
    )

    db.commit()
    for su in units:
        db.refresh(su)
    return units


@router.patch("/{stock_unit_id}", response_model=StockUnitOut)
def update_stock_unit(stock_unit_id: int, payload: StockUnitUpdate, db: Session= Depends(get_db)):
    stock_unit = db.get(StockUnit, stock_unit_id)
    if not stock_unit:
        raise HTTPException(404, "Stock unit not found")
    
    data = payload.model_dump(exclude_unset=True)
    # For MVP: don't allow moving a stock unit to another variant / uom via PATCH.
    if "variant_id" in data and data["variant_id"] != stock_unit.variant_id:
        raise HTTPException(422, "variant_id cannot be changed")
    if "uom" in data and data["uom"] != stock_unit.uom:
        raise HTTPException(422, "uom cannot be changed")
    if "initial_qty" in data and data["initial_qty"] != stock_unit.initial_qty:
        raise HTTPException(422, "initial_qty cannot be changed")

    # Keep roll/per-meter cost fields consistent if only one field is patched.
    if "cost_roll_price" in data or "cost_per_m" in data:
        next_roll = data.get("cost_roll_price", stock_unit.cost_roll_price)
        next_per_m = data.get("cost_per_m", stock_unit.cost_per_m)
        if next_roll is not None and next_roll < 0:
            raise HTTPException(422, "cost_roll_price must be >= 0")
        if next_per_m is not None and next_per_m < 0:
            raise HTTPException(422, "cost_per_m must be >= 0")

        if "cost_roll_price" in data and "cost_per_m" not in data:
            next_per_m = (next_roll / stock_unit.initial_qty) if next_roll is not None and stock_unit.initial_qty > 0 else None
        if "cost_per_m" in data and "cost_roll_price" not in data:
            next_roll = (next_per_m * stock_unit.initial_qty) if next_per_m is not None else None

        data["cost_roll_price"] = next_roll
        data["cost_per_m"] = next_per_m

    old_remaining = stock_unit.remaining_qty
    old_cost_roll_price = stock_unit.cost_roll_price
    old_cost_per_m = stock_unit.cost_per_m

    for k,v in data.items():
        setattr(stock_unit, k, v)

    if stock_unit.remaining_qty < 0:
        raise HTTPException(422, "remaining_qty must be >= 0")

    stock_unit.is_depleted = stock_unit.remaining_qty <= 0
    
    if stock_unit.location_id is not None:
        exists = db.get(Location, stock_unit.location_id)
        if not exists:
            raise HTTPException(404, "Location not found")

    v = db.get(Product, stock_unit.variant_id)
    old_variant_cost = v.cost_price if v is not None else None
    try:
        # Keep variant.stock in sync with remaining_qty changes.
        if v is not None and v.track_stock_unit:
            if v.stock is None:
                v.stock = Decimal("0")
            v.stock += (stock_unit.remaining_qty - old_remaining)
            if ("cost_per_m" in data) or ("remaining_qty" in data):
                recomputed = recompute_variant_cost_from_stock_units(db, variant_id=v.id)
                if recomputed is not None:
                    v.cost_price = recomputed

        db.flush()
        record_price_change(
            db,
            variant_id=stock_unit.variant_id,
            stock_unit_id=stock_unit.id,
            field="cost_roll_price",
            old_value=old_cost_roll_price,
            new_value=stock_unit.cost_roll_price,
            source="stock_unit_update",
        )
        record_price_change(
            db,
            variant_id=stock_unit.variant_id,
            stock_unit_id=stock_unit.id,
            field="cost_per_m",
            old_value=old_cost_per_m,
            new_value=stock_unit.cost_per_m,
            source="stock_unit_update",
        )
        if v is not None:
            record_price_change(
                db,
                variant_id=v.id,
                field="cost_price",
                old_value=old_variant_cost,
                new_value=v.cost_price,
                source="stock_unit_update",
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Barcode already exists")
    db.refresh(stock_unit)
    return stock_unit
