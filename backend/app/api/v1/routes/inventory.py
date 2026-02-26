from decimal import Decimal
from datetime import date as date_type, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.inventory import Inventory
from app.models.product import Product, is_sellable_product
from app.models.stock_unit import StockUnit
from app.models.location import Location
from app.models.supplier import Supplier
from app.services.pricing import compute_moving_average_cost, record_price_change

from app.schemas.inventory import (
    InventoryOut,
    InventoryReceiveHistoryOut,
    InventoryReceiveCreate,
    InventorySaleCreate,
    InventoryTransferCreate,
    InventoryAdjustCreate,
)

router = APIRouter()
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
UTC_TZ = ZoneInfo("UTC")


def _assert_sellable_variant(v: Product | None) -> Product:
    if not is_sellable_product(v):
        raise HTTPException(404, "Variant not found")
    return v


@router.get("/movements", response_model=list[InventoryOut])
def list_inventory_movement(db: Session = Depends(get_db)):
    r = db.query(Inventory).all()
    return r


@router.get("/receives", response_model=list[InventoryReceiveHistoryOut])
def list_receive_history(
    date: date_type | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    variant_id: int | None = None,
    supplier_id: int | None = None,
    q: str | None = None,
    limit: int = 300,
    db: Session = Depends(get_db),
):
    qx = (
        select(
            Inventory.id.label("id"),
            Inventory.created_at.label("created_at"),
            Inventory.variant_id.label("variant_id"),
            Product.name.label("variant_name"),
            Product.sku.label("sku"),
            Product.uom.label("uom"),
            Inventory.stock_unit_id.label("stock_unit_id"),
            Inventory.qty.label("qty"),
            Inventory.supplier_id.label("supplier_id"),
            Supplier.name.label("supplier_name"),
            Inventory.note.label("note"),
        )
        .join(Product, Product.id == Inventory.variant_id)
        .outerjoin(Supplier, Supplier.id == Inventory.supplier_id)
        .where(Inventory.type == "receive")
        .order_by(Inventory.id.desc())
    )

    if variant_id is not None:
        qx = qx.where(Inventory.variant_id == variant_id)
    if supplier_id is not None:
        qx = qx.where(Inventory.supplier_id == supplier_id)

    if date is not None:
        # Inventory.created_at is stored as naive UTC (SQLite func.now()).
        start_local = datetime.combine(date, time.min, tzinfo=VN_TZ)
        end_local = start_local + timedelta(days=1)
        start_utc = start_local.astimezone(UTC_TZ).replace(tzinfo=None)
        end_utc = end_local.astimezone(UTC_TZ).replace(tzinfo=None)
        qx = qx.where(Inventory.created_at >= start_utc, Inventory.created_at < end_utc)
    else:
        if date_from is not None:
            qx = qx.where(Inventory.created_at >= date_from)
        if date_to is not None:
            qx = qx.where(Inventory.created_at <= date_to)

    if q and q.strip():
        like = f"%{q.strip()}%"
        qx = qx.where(
            or_(
                Product.name.ilike(like),
                Product.sku.ilike(like),
                Supplier.name.ilike(like),
                Inventory.note.ilike(like),
                cast(Inventory.stock_unit_id, String).ilike(like),
            )
        )

    safe_limit = max(1, min(int(limit or 300), 2000))
    qx = qx.limit(safe_limit)

    rows = db.execute(qx).mappings().all()
    return [InventoryReceiveHistoryOut(**r) for r in rows]

@router.post("/receive", response_model=InventoryOut)
def receive(payload: InventoryReceiveCreate, db: Session = Depends(get_db)):
    qty = payload.qty
    if qty <= 0:
        raise HTTPException(422, "qty must be > 0")
    if payload.cost_price is not None and payload.cost_price < 0:
        raise HTTPException(422, "cost_price must be >= 0")

    v = _assert_sellable_variant(db.get(Product, payload.variant_id))
    if v.track_stock_unit:
        raise HTTPException(422, "This variant tracks stock units; receive via /stock_units instead")

    if payload.supplier_id is not None:
        sup = db.get(Supplier, payload.supplier_id)
        if sup is None:
            raise HTTPException(404, "Supplier not found")

    old_stock = v.stock or Decimal("0")
    old_cost_price = v.cost_price
    if v.stock is None:
        v.stock = Decimal("0")
    v.stock += qty

    if payload.cost_price is not None:
        v.cost_price = compute_moving_average_cost(
            current_cost=v.cost_price,
            current_qty=old_stock,
            received_cost=payload.cost_price,
            received_qty=qty,
        )
        record_price_change(
            db,
            variant_id=v.id,
            field="cost_price",
            old_value=old_cost_price,
            new_value=v.cost_price,
            source="inventory_receive",
            note=payload.note,
        )

    obj = Inventory(
        type="receive",
        variant_id=v.id,
        supplier_id=payload.supplier_id,
        qty=qty,
        note=payload.note,
    )

    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.post("/sale", response_model=InventoryOut)
def sale(payload: InventorySaleCreate, db: Session = Depends(get_db)):
    
    qty = payload.qty
    if qty <= 0:
        raise HTTPException(422, "qty must be > 0")
    

    if payload.stock_unit_id is not None:
        su = db.get(StockUnit, payload.stock_unit_id)
        if su is None:
            raise HTTPException(404, "Stock unit not found")
        if su.remaining_qty < qty:
            raise HTTPException(409, "Insufficient stock")
        if su.variant_id != payload.variant_id:
            raise HTTPException(422, "Variant and stock unit mismatched")

        su.remaining_qty -= qty
        su.is_depleted = (su.remaining_qty <= 0)

        v = db.get(Product, su.variant_id)
        if v is not None and not v.is_active:
            raise HTTPException(422, "Variant is inactive")
        if v is not None and v.track_stock_unit:
            if v.stock is None:
                v.stock = Decimal("0")
            v.stock -= qty

        obj = Inventory(
            type="sale",
            variant_id=su.variant_id,
            stock_unit_id=su.id,
            from_location_id=su.location_id,
            qty=qty,
            note=payload.note,
        )
    else:
        s = _assert_sellable_variant(db.get(Product, payload.variant_id))
        if not s.is_active:
            raise HTTPException(422, "Variant is inactive")
        if s.track_stock_unit:
            raise HTTPException(422, "This variant tracks stock units; stock_unit_id is required")
        if s.stock is None or s.stock < qty:
            raise HTTPException(409, "Insufficient stock")

        s.stock -= qty

        obj = Inventory(
            type="sale",
            variant_id=s.id,
            qty=qty,
            note=payload.note,

        )


    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.post("/transfer", response_model=InventoryOut)
def transfer(payload: InventoryTransferCreate, db: Session = Depends(get_db)):
    su = db.get(StockUnit, payload.stock_unit_id)
    if su is None:
        raise HTTPException(404, "Stock unit not found")

    v = _assert_sellable_variant(db.get(Product, su.variant_id))
    if not v.track_stock_unit:
        raise HTTPException(422, "This variant does not track stock units")

    to_loc = db.get(Location, payload.to_location_id)
    if to_loc is None:
        raise HTTPException(404, "Location not found")

    from_location_id = su.location_id
    if from_location_id == payload.to_location_id:
        raise HTTPException(422, "from_location_id and to_location_id must be different")

    su.location_id = payload.to_location_id

    obj = Inventory(
        type="transfer",
        variant_id=v.id,
        stock_unit_id=su.id,
        from_location_id=from_location_id,
        to_location_id=payload.to_location_id,
        qty=su.remaining_qty,
        note=payload.note,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.post("/adjust", response_model=InventoryOut)
def adjust(payload: InventoryAdjustCreate, db: Session = Depends(get_db)):
    if payload.qty == 0:
        raise HTTPException(422, "qty must not be 0")

    v = _assert_sellable_variant(db.get(Product, payload.variant_id))

    if payload.stock_unit_id is not None:
        su = db.get(StockUnit, payload.stock_unit_id)
        if su is None:
            raise HTTPException(404, "Stock unit not found")
        if su.variant_id != v.id:
            raise HTTPException(422, "Variant and stock unit mismatched")
        if not v.track_stock_unit:
            raise HTTPException(422, "This variant does not track stock units")

        new_remaining = su.remaining_qty + payload.qty
        if new_remaining < 0:
            raise HTTPException(409, "Insufficient stock")
        if new_remaining > su.initial_qty:
            raise HTTPException(422, "remaining_qty cannot exceed initial_qty")

        su.remaining_qty = new_remaining
        su.is_depleted = (su.remaining_qty <= 0)

        if v.stock is None:
            v.stock = Decimal("0")
        v.stock += payload.qty
        if v.stock < 0:
            # defensive: should not happen if su check passed, but keep invariant
            raise HTTPException(409, "Insufficient stock")

        obj = Inventory(
            type="adjust",
            variant_id=v.id,
            stock_unit_id=su.id,
            from_location_id=su.location_id,
            qty=payload.qty,
            note=payload.note,
        )
    else:
        if v.track_stock_unit:
            raise HTTPException(422, "This variant tracks stock units; stock_unit_id is required")

        if v.stock is None:
            v.stock = Decimal("0")
        new_stock = v.stock + payload.qty
        if new_stock < 0:
            raise HTTPException(409, "Insufficient stock")
        v.stock = new_stock

        obj = Inventory(
            type="adjust",
            variant_id=v.id,
            qty=payload.qty,
            note=payload.note,
        )

    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj



# @router.get("/", response_model=list[InventoryOut])
# def query_stock(
#     db: Session = Depends(get_db), 
# ):
    
