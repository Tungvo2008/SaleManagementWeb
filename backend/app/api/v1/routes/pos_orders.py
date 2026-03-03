from __future__ import annotations

from decimal import Decimal
from datetime import datetime, date as date_type, time, timedelta
from zoneinfo import ZoneInfo
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, cast, String
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.product import Product, is_sellable_product
from app.models.stock_unit import StockUnit
from app.models.inventory import Inventory
from app.models.customer import Customer


from app.schemas.order import (
    OrderCreate,
    OrderOut,
    OrderCheckoutIn,
    OrderUpdate,
    OrderRefundIn,
    OrderRefundOut,
    OrderRefundLineOut,
)
from app.schemas.order_item import (
    OrderItemOut,
    OrderItemCreateNormal,
    OrderItemCreateRoll,
    OrderItemUpdateNormal,
    OrderItemUpdateRoll,
    OrderItemDiscountUpdate,
)

from app.schemas.receipt import ReceiptItemOut, ReceiptOut


router = APIRouter(prefix="/orders")

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
UTC_TZ = ZoneInfo("UTC")

def _recalc_order(order: Order) -> None:
    subtotal = order.subtotal if order.subtotal is not None else Decimal("0")
    if subtotal < 0:
        subtotal = Decimal("0")
        order.subtotal = subtotal

    mode = getattr(order, "discount_mode", None) or "amount"
    value = getattr(order, "discount_value", None)
    if value is None:
        value = Decimal("0")

    if mode == "percent":
        if value < 0:
            value = Decimal("0")
        if value > 100:
            value = Decimal("100")
        discount_total = (subtotal * value) / Decimal("100")
    else:
        # amount
        if value < 0:
            value = Decimal("0")
        discount_total = value

    if discount_total < 0:
        discount_total = Decimal("0")
    if discount_total > subtotal:
        discount_total = subtotal

    order.discount_mode = mode
    order.discount_value = value
    order.discount_total = discount_total

    order.grand_total = subtotal - discount_total
    if order.grand_total < 0:
        order.grand_total = Decimal("0")


def _recalc_item(item: OrderItem) -> None:
    gross = (item.qty or Decimal("0")) * (item.unit_price or Decimal("0"))
    mode = getattr(item, "discount_mode", None)
    value = getattr(item, "discount_value", None)

    if mode == "percent":
        if value is None or value < 0:
            value = Decimal("0")
        if value > 100:
            value = Decimal("100")
        discount_total = (gross * value) / Decimal("100")
    elif mode == "amount":
        if value is None or value < 0:
            value = Decimal("0")
        discount_total = value
    else:
        # None or unknown => no discount
        mode = None
        value = None
        discount_total = Decimal("0")

    if discount_total < 0:
        discount_total = Decimal("0")
    if discount_total > gross:
        discount_total = gross

    item.discount_mode = mode
    item.discount_value = value
    item.discount_total = discount_total
    item.line_total = gross - discount_total

def _get_order_or_404(order_id: int, db: Session) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(404, "Order not found")
    return order


def _get_draft_order_or_409(order_id: int, db: Session) -> Order:
    """
    POS rule: only draft orders can be modified (add/update/delete/cancel/checkout).
    This keeps the system consistent: once checked out, the order becomes immutable.
    """
    order = _get_order_or_404(order_id, db)
    if order.status != "draft":
        raise HTTPException(409, "Order is not draft")
    return order


def _get_checked_out_order_or_409(order_id: int, db: Session) -> Order:
    order = _get_order_or_404(order_id, db)
    if order.status != "checked_out":
        raise HTTPException(409, "Order is not checked out")
    return order


def _assert_sellable_variant(v: Product | None) -> Product:
    if not is_sellable_product(v):
        raise HTTPException(404, "Variant not found")
    return v


def _assert_variant_active(v: Product) -> None:
    if not v.is_active:
        raise HTTPException(422, "Variant is inactive")


def _assert_stock_unit_not_reserved(order_id: int, stock_unit_id: int, db: Session) -> None:
    """
    Prevent two draft orders from using the same physical roll at the same time.
    MVP rule: a StockUnit can be present in at most 1 draft order.
    """
    reserved = db.execute(
        select(OrderItem.order_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.status == "draft",
            OrderItem.stock_unit_id == stock_unit_id,
            OrderItem.order_id != order_id,
        )
        .limit(1)
    ).first()
    if reserved:
        raise HTTPException(409, "This stock unit is being used in another draft order")


@router.post("/", response_model=OrderOut)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    # Reuse latest empty draft to avoid creating unlimited empty orders.
    existing_empty = db.scalars(
        select(Order)
        .where(
            Order.status == "draft",
            ~select(OrderItem.id).where(OrderItem.order_id == Order.id).exists(),
        )
        .order_by(Order.id.desc())
    ).first()
    if existing_empty is not None:
        # Reset meta so "đơn mới" is truly clean.
        existing_empty.note = payload.note
        existing_empty.customer_id = None
        existing_empty.subtotal = Decimal("0")
        existing_empty.discount_mode = "amount"
        existing_empty.discount_value = Decimal("0")
        existing_empty.discount_total = Decimal("0")
        existing_empty.grand_total = Decimal("0")
        db.commit()
        db.refresh(existing_empty)
        return existing_empty

    obj = Order(
        status="draft",
        note=payload.note,
        subtotal=Decimal("0"),
        discount_mode="amount",
        discount_value=Decimal("0"),
        discount_total=Decimal("0"),
        grand_total=Decimal("0"),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    return _get_order_or_404(order_id, db)


@router.get("/", response_model=list[OrderOut])
def list_orders(
    status: str = "draft",
    date: date_type | None = None,
    date_from: date_type | None = None,
    date_to: date_type | None = None,
    search: str | None = Query(None, alias="q"),
    sort: str = "newest",
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = select(Order)
    if status is not None:
        q = q.where(Order.status == status)
    if date is not None and status == "checked_out":
        start_local = datetime.combine(date, time.min, tzinfo=VN_TZ)
        end_local = start_local + timedelta(days=1)
        start_utc = start_local.astimezone(UTC_TZ).replace(tzinfo=None)
        end_utc = end_local.astimezone(UTC_TZ).replace(tzinfo=None)
        q = q.where(
            Order.checked_out_at.is_not(None),
            Order.checked_out_at >= start_utc,
            Order.checked_out_at < end_utc,
        )
    elif status == "checked_out" and (date_from is not None or date_to is not None):
        if date_from is not None and date_to is not None and date_from > date_to:
            raise HTTPException(422, "date_from must be <= date_to")

        q = q.where(Order.checked_out_at.is_not(None))
        if date_from is not None:
            start_local = datetime.combine(date_from, time.min, tzinfo=VN_TZ)
            start_utc = start_local.astimezone(UTC_TZ).replace(tzinfo=None)
            q = q.where(Order.checked_out_at >= start_utc)
        if date_to is not None:
            end_local = datetime.combine(date_to, time.min, tzinfo=VN_TZ) + timedelta(days=1)
            end_utc = end_local.astimezone(UTC_TZ).replace(tzinfo=None)
            q = q.where(Order.checked_out_at < end_utc)
    if search is not None and search.strip():
        needle = f"%{search.strip()}%"
        q = q.outerjoin(Customer, Customer.id == Order.customer_id).where(
            or_(
                cast(Order.id, String).ilike(needle),
                Order.note.ilike(needle),
                Customer.name.ilike(needle),
                Customer.phone.ilike(needle),
            )
        )

    if sort == "oldest":
        q = q.order_by(Order.id.asc())
    elif sort == "total_desc":
        q = q.order_by(Order.grand_total.desc(), Order.id.desc())
    elif sort == "total_asc":
        q = q.order_by(Order.grand_total.asc(), Order.id.desc())
    else:
        # default newest
        q = q.order_by(Order.id.desc())
    q = q.limit(max(1, min(int(limit or 200), 1000)))
    return list(db.scalars(q).all())

@router.patch("/{order_id}", response_model=OrderOut)
def update_order(order_id: int, payload: OrderUpdate, db: Session = Depends(get_db)):
    """
    Update draft order metadata (MVP):
    - note
    - discount_total (>= 0)
    """
    order = _get_draft_order_or_409(order_id, db)

    data = payload.model_dump(exclude_unset=True)
    if "note" in data:
        order.note = data["note"]
    if "customer_id" in data:
        cid = data["customer_id"]
        if cid is None:
            order.customer_id = None
        else:
            c = db.get(Customer, cid)
            if c is None or not c.is_active:
                raise HTTPException(404, "Customer not found")
            order.customer_id = c.id
    # Backward compatible: discount_total => amount
    if "discount_total" in data and data["discount_total"] is not None:
        order.discount_mode = "amount"
        order.discount_value = data["discount_total"]
    if "discount_mode" in data and data["discount_mode"] is not None:
        order.discount_mode = data["discount_mode"]
    if "discount_value" in data and data["discount_value"] is not None:
        order.discount_value = data["discount_value"]

    _recalc_order(order)

    db.commit()
    db.refresh(order)
    return order



@router.post("/{order_id}/items/normal", response_model=OrderItemOut)
def add_normal_item(order_id: int, payload: OrderItemCreateNormal, db: Session = Depends(get_db)):
    order = _get_draft_order_or_409(order_id, db)
    
    product = _assert_sellable_variant(db.get(Product, payload.variant_id))
    _assert_variant_active(product)
    if product.track_stock_unit:
        raise HTTPException(422, "This variant is roll-tracked; use /items/roll")
    if product.price is None:
        raise HTTPException(422, "Missing Price")
    
    existing = db.scalars(
        select(OrderItem).where(
            OrderItem.order_id == order.id,
            OrderItem.pricing_mode == "normal",
            OrderItem.variant_id == product.id,
            OrderItem.stock_unit_id.is_(None),
        )
    ).first()

    if existing:
        new_qty = existing.qty + payload.qty
        if product.stock < new_qty:
            raise HTTPException(409, "Insufficient stock")
        existing.qty = new_qty
        old_line_total = existing.line_total
        _recalc_item(existing)
        delta = existing.line_total - old_line_total
        
        order.subtotal += delta
        _recalc_order(order)
        
        db.commit()

        return existing


    else:
        
        unit_price = product.price
        line_total = payload.qty * unit_price

        item = OrderItem(
            order_id=order_id,
            variant_id=product.id,
            stock_unit_id=None,
            pricing_mode="normal",
            qty=payload.qty,
            unit_price=unit_price,
            # discounts default to none
            discount_mode=None,
            discount_value=None,
            discount_total=Decimal("0"),
            line_total=line_total,
            name_snapshot=product.name,
            sku_snapshot=product.sku,
            uom_snapshot=product.uom
        )

        order.subtotal += line_total
        _recalc_order(order)
        
        db.add(item)
        db.commit()
        db.refresh(item)

        return item
    




    

@router.post("/{order_id}/items/roll", response_model=OrderItemOut)
def add_roll_item(order_id: int, payload: OrderItemCreateRoll ,db: Session = Depends(get_db)):
    order = _get_draft_order_or_409(order_id, db)
    
    su = db.scalars(select(StockUnit).where(StockUnit.barcode == payload.barcode)).first()
    if su is None:
        raise HTTPException(404, "Stock Unit not found")

    _assert_stock_unit_not_reserved(order.id, su.id, db)
    
    product = _assert_sellable_variant(db.get(Product, su.variant_id))
    _assert_variant_active(product)
    if not product.track_stock_unit:
        raise HTTPException(422, "This variant is not roll-tracked; use /items/normal")
    if (product.uom or "m") != "m":
        raise HTTPException(422, "Only meter-based roll goods are supported")
    

    existing_any = db.scalars(
        select(OrderItem).where(
            OrderItem.order_id == order.id,
            OrderItem.stock_unit_id == su.id,
        )
    ).first()

    if existing_any and existing_any.pricing_mode != payload.mode:
        raise HTTPException(409, "This roll is already in cart with different mode; update it instead")

    if existing_any and payload.mode == "roll":
        raise HTTPException(409, "Already added")
    
    if existing_any:
        if payload.qty is None:
            raise HTTPException(422, "Qty required")
        if payload.qty <= 0:
            raise HTTPException(422, "qty must be > 0")

        new_qty = existing_any.qty + payload.qty
        if new_qty > su.remaining_qty:
            raise HTTPException(409, "Insufficient stock")
        existing_any.qty = new_qty
        old_line_total = existing_any.line_total
        _recalc_item(existing_any)
        delta = existing_any.line_total - old_line_total
        order.subtotal += delta
        _recalc_order(order)
        
        db.commit()

        return existing_any

    
    elif payload.mode == "roll":
        if su.remaining_qty != su.initial_qty:
            raise HTTPException(409, "Roll is not full")
        if su.remaining_qty <= 0:
            raise HTTPException(409, "Out of quantity")
        if product.price is None:
            raise HTTPException(422, "Missing price per meter")
        
        unit_price = product.roll_price
        if unit_price is None:
            # fallback: no special roll price => price_per_m * meters_in_roll
            unit_price = product.price * su.remaining_qty

        item = OrderItem(
            order_id=order_id,
            variant_id=product.id,
            stock_unit_id=su.id,
            pricing_mode="roll",
            qty=Decimal("1"),
            unit_price=unit_price,
            discount_mode=None,
            discount_value=None,
            discount_total=Decimal("0"),
            line_total=unit_price,
            name_snapshot=product.name,
            sku_snapshot=product.sku,
            uom_snapshot="roll"
        )
        _recalc_item(item)

    elif payload.mode == "meter":
        if payload.qty is None:
            raise HTTPException(422, "Quantity Required")
        if payload.qty <= 0:
            raise HTTPException(422, "qty must be > 0")
        if payload.qty > su.remaining_qty:
            raise HTTPException(409, "Insufficient quantity")
        if product.price is None:
            raise HTTPException(422, "Missing price per meter")
        
        item = OrderItem(
            order_id=order_id,
            variant_id=product.id,
            stock_unit_id=su.id,
            pricing_mode="meter",
            qty=payload.qty,
            unit_price=product.price,
            discount_mode=None,
            discount_value=None,
            discount_total=Decimal("0"),
            line_total=product.price * payload.qty,
            name_snapshot=product.name,
            sku_snapshot=product.sku,
            uom_snapshot="m"
        )
        _recalc_item(item)
    else:
        raise HTTPException(422, "Invalid mode")

    order.subtotal += item.line_total
    _recalc_order(order)
    
    db.add(item)
    db.commit()
    db.refresh(item)

    return item


@router.post("/{order_id}/checkout", response_model=OrderOut)
def checkout(order_id: int, payload: OrderCheckoutIn, db: Session = Depends(get_db)):
    order = _get_draft_order_or_409(order_id, db)
    
    
    items = list(db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all())

    if not items:
        raise HTTPException(422, "Order is empty")

    # Recompute totals from the current cart (source of truth for checkout).
    subtotal = sum((it.line_total for it in items), Decimal("0"))
    order.subtotal = subtotal
    _recalc_order(order)
    grand_total = order.grand_total

    # Validate payment
    if payload.payment_method == "cash":
        if payload.paid_amount < grand_total:
            raise HTTPException(409, "Insufficient payment")
        change_amount = payload.paid_amount - grand_total
    else:
        # MVP: non-cash must match exactly
        if payload.paid_amount != grand_total:
            raise HTTPException(409, "Paid amount must equal grand total for non-cash payments")
        change_amount = Decimal("0")

    # Apply optional note at checkout time
    if payload.note is not None:
        order.note = payload.note
    
    try:
        for item in items:
            if item.pricing_mode == "normal":
                variant = _assert_sellable_variant(db.get(Product, item.variant_id))
                _assert_variant_active(variant)
                if variant.track_stock_unit:
                    raise HTTPException(422, "Incorrect pricing mode")
                if variant.stock is None or variant.stock < item.qty:
                    raise HTTPException(409, "Insufficient stock")
                variant.stock -= item.qty
                db.add(
                    Inventory(
                        type="sale",
                        variant_id=variant.id,
                        qty=item.qty,
                        note=f"order {order.id}",
                    )
                )

            elif item.pricing_mode == "meter":
                su = db.get(StockUnit, item.stock_unit_id)
                variant = _assert_sellable_variant(db.get(Product, item.variant_id))
                _assert_variant_active(variant)
                if su is None:
                    raise HTTPException(404, "Stock Unit not found")
                if not variant.track_stock_unit:
                    raise HTTPException(422, "Incorrect pricing mode")
                if variant.id != su.variant_id:
                    raise HTTPException(422, "Variant/StockUnit Mismatched")
                if su.remaining_qty < item.qty:
                    raise HTTPException(409, "Insufficient stock")

                su.remaining_qty -= item.qty
                su.is_depleted = su.remaining_qty <= 0
                if variant.stock is None:
                    variant.stock = Decimal("0")
                variant.stock -= item.qty

                db.add(
                    Inventory(
                        type="sale",
                        variant_id=variant.id,
                        stock_unit_id=su.id,
                        from_location_id=su.location_id,
                        qty=item.qty,
                        note=f"order {order.id}",
                    )
                )

            elif item.pricing_mode == "roll":
                su = db.get(StockUnit, item.stock_unit_id)
                variant = _assert_sellable_variant(db.get(Product, item.variant_id))
                _assert_variant_active(variant)
                if su is None:
                    raise HTTPException(404, "Stock Unit not found")
                if not variant.track_stock_unit:
                    raise HTTPException(422, "Incorrect pricing mode")
                if variant.id != su.variant_id:
                    raise HTTPException(422, "Variant/StockUnit Mismatched")
                if su.remaining_qty != su.initial_qty or su.remaining_qty <= 0:
                    raise HTTPException(422, "Not a full roll")

                qty_inventory_m = su.remaining_qty
                su.remaining_qty = Decimal("0")
                su.is_depleted = True
                if variant.stock is None:
                    variant.stock = Decimal("0")
                variant.stock -= qty_inventory_m

                db.add(
                    Inventory(
                        type="sale",
                        variant_id=variant.id,
                        stock_unit_id=su.id,
                        from_location_id=su.location_id,
                        qty=qty_inventory_m,
                        note=f"order {order.id}",
                    )
                )

            else:
                raise HTTPException(422, "Invalid pricing mode")

        order.status = "checked_out"
        order.payment_method = payload.payment_method
        order.paid_amount = payload.paid_amount
        order.change_amount = change_amount
        order.checked_out_at = datetime.now()

        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(order)
    return order


@router.delete("/{order_id}/items/{item_id}")
def delete_item(order_id: int, item_id: int, db : Session = Depends(get_db)):
    order = _get_draft_order_or_409(order_id, db)
    
    item = db.get(OrderItem, item_id)
    if item is None or item.order_id != order.id:
        raise HTTPException(404, "Order item not found")
    
    order.subtotal -= item.line_total
    _recalc_order(order)

    db.delete(item)
    try:
        db.commit()
    except:
        db.rollback()

    return {"deleted": True}


@router.patch("/{order_id}/items/{item_id}/discount", response_model=OrderItemOut)
def update_item_discount(
    order_id: int,
    item_id: int,
    payload: OrderItemDiscountUpdate,
    db: Session = Depends(get_db),
):
    order = _get_draft_order_or_409(order_id, db)

    item = db.get(OrderItem, item_id)
    if item is None or item.order_id != order.id:
        raise HTTPException(404, "Order item not found")

    old_line_total = item.line_total

    if payload.mode == "none":
        item.discount_mode = None
        item.discount_value = None
    elif payload.mode == "amount":
        if payload.value is None:
            raise HTTPException(422, "value is required for amount discount")
        item.discount_mode = "amount"
        item.discount_value = payload.value
    elif payload.mode == "percent":
        if payload.value is None:
            raise HTTPException(422, "value is required for percent discount")
        if payload.value > 100:
            raise HTTPException(422, "percent discount must be <= 100")
        item.discount_mode = "percent"
        item.discount_value = payload.value
    else:
        raise HTTPException(422, "Invalid discount mode")

    _recalc_item(item)

    order.subtotal += (item.line_total - old_line_total)
    _recalc_order(order)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(item)
    return item


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_draft(order_id: int, db: Session = Depends(get_db)):
    order = _get_draft_order_or_409(order_id, db)

    has_items = db.scalars(select(OrderItem.id).where(OrderItem.order_id == order.id).limit(1)).first()
    if has_items is None:
        raise HTTPException(409, "Order is empty; nothing to cancel")
    
    order.status = "cancelled"

    try:
        db.commit()
    except:
        db.rollback()

    db.refresh(order)

    return order

@router.patch("/{order_id}/items/{item_id}/normal", response_model=OrderItemOut)
def update_normal_item(order_id: int, item_id: int, payload: OrderItemUpdateNormal, db: Session = Depends(get_db)):
    order = _get_draft_order_or_409(order_id, db)
    
    item = db.get(OrderItem, item_id)
    if item is None or item.order_id != order.id:
        raise HTTPException(404, "Order item not found")
    if item.pricing_mode != "normal":
        raise HTTPException(422, "Incorrect pricing mode")
    
    variant = _assert_sellable_variant(db.get(Product, item.variant_id))
    _assert_variant_active(variant)
    if variant.price is None:
        raise HTTPException(422, "Missing price")
    

    unit_price = variant.price
    old_line_total = item.line_total
    
    item.qty = payload.qty
    item.unit_price = unit_price
    _recalc_item(item)

    delta = item.line_total - old_line_total
    order.subtotal += delta
    _recalc_order(order)

    try:
        db.commit()
    except:
        db.rollback()

    db.refresh(item)

    return item


@router.patch("/{order_id}/items/{item_id}/roll", response_model=OrderItemOut)
def update_roll_item(order_id: int, item_id: int, payload: OrderItemUpdateRoll, db: Session = Depends(get_db)):
    order = _get_draft_order_or_409(order_id, db)

    item = db.get(OrderItem, item_id)
    if item is None or item.order_id != order.id:
        raise HTTPException(404, "Order item not found")
    if item.pricing_mode not in ("meter", "roll"):
        raise HTTPException(422, "Incorrect pricing mode")
    if item.stock_unit_id is None:
        raise HTTPException(422, "Missing stock_unit_id")

    su = db.get(StockUnit, item.stock_unit_id)
    if su is None:
        raise HTTPException(404, "Stock Unit not found")

    variant = _assert_sellable_variant(db.get(Product, item.variant_id))
    _assert_variant_active(variant)
    if not variant.track_stock_unit:
        raise HTTPException(422, "This variant is not roll-tracked")
    if su.variant_id != variant.id:
        raise HTTPException(422, "Variant/StockUnit Mismatched")
    if (variant.uom or "m") != "m":
        raise HTTPException(422, "Only meter-based roll goods are supported")
    if variant.price is None:
        raise HTTPException(422, "Missing price per meter")

    old_line_total = item.line_total
    desired_mode = payload.mode or item.pricing_mode

    if desired_mode == "meter":
        qty = payload.qty if payload.qty is not None else item.qty
        if qty is None:
            raise HTTPException(422, "Quantity Required")
        if qty > su.remaining_qty:
            raise HTTPException(409, "Insufficient quantity")

        unit_price = variant.price
        line_total_new = unit_price * qty

        item.pricing_mode = "meter"
        item.qty = qty
        item.unit_price = unit_price
        item.line_total = line_total_new
        item.uom_snapshot = "m"

    elif desired_mode == "roll":
        if su.remaining_qty != su.initial_qty or su.remaining_qty <= 0:
            raise HTTPException(409, "Roll is not full")

        unit_price = variant.roll_price
        if unit_price is None:
            unit_price = variant.price * su.remaining_qty
        line_total_new = unit_price

        item.pricing_mode = "roll"
        item.qty = Decimal("1")
        item.unit_price = unit_price
        item.line_total = line_total_new
        item.uom_snapshot = "roll"

    else:
        raise HTTPException(422, "Invalid mode")

    _recalc_item(item)
    delta = item.line_total - old_line_total
    order.subtotal += delta
    _recalc_order(order)

    try:
        db.commit()
    except:
        db.rollback()

    db.refresh(item)
    return item


@router.get("/{order_id}/receipt", response_model=ReceiptOut)
def get_receipt(order_id: int, db: Session = Depends(get_db)):
    """
    Receipt is a *read model*: it uses order_item snapshot fields so the printed
    bill stays correct even if Product name/price changes later.
    """
    order = _get_order_or_404(order_id, db)

    order_items = list(
        db.scalars(
            select(OrderItem)
            .where(OrderItem.order_id == order.id)
            .order_by(OrderItem.id.asc())
        ).all()
    )

    # Avoid N+1: fetch all barcodes for referenced stock_unit_ids in one query.
    stock_unit_ids = [it.stock_unit_id for it in order_items if it.stock_unit_id is not None]
    barcode_by_id: dict[int, str | None] = {}
    if stock_unit_ids:
        rows = db.execute(
            select(StockUnit.id, StockUnit.barcode).where(StockUnit.id.in_(stock_unit_ids))
        ).all()
        barcode_by_id = {sid: bc for (sid, bc) in rows}

    items: list[ReceiptItemOut] = []
    for it in order_items:
        refunded_qty = it.refunded_qty or Decimal("0")
        refundable_qty = (it.qty or Decimal("0")) - refunded_qty
        if refundable_qty < 0:
            refundable_qty = Decimal("0")
        items.append(
            ReceiptItemOut(
                item_id=it.id,
                name=it.name_snapshot,
                sku=it.sku_snapshot,
                pricing_mode=it.pricing_mode,
                qty=it.qty,
                uom=it.uom_snapshot,
                unit_price=it.unit_price,
                discount_mode=it.discount_mode,
                discount_value=it.discount_value,
                discount_total=it.discount_total or Decimal("0"),
                line_total=it.line_total,
                refunded_qty=refunded_qty,
                refundable_qty=refundable_qty,
                barcode=barcode_by_id.get(it.stock_unit_id) if it.stock_unit_id is not None else None,
            )
        )

    subtotal = order.subtotal if order.subtotal is not None else Decimal("0")
    discount_total = order.discount_total if order.discount_total is not None else Decimal("0")
    grand_total = order.grand_total if order.grand_total is not None else (subtotal - discount_total)

    customer_name = None
    customer_phone = None
    if order.customer_id is not None:
        c = db.get(Customer, order.customer_id)
        if c is not None:
            customer_name = c.name
            customer_phone = c.phone

    return ReceiptOut(
        order_id=order.id,
        status=order.status,
        created_at=order.created_at,
        items=items,
        customer_id=order.customer_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        subtotal=subtotal,
        discount_total=discount_total,
        grand_total=grand_total,
    )


@router.post("/{order_id}/refund", response_model=OrderRefundOut)
def refund_order_items(order_id: int, payload: OrderRefundIn, db: Session = Depends(get_db)):
    """
    Partial refund for a checked-out order:
    - restore inventory for selected lines/quantities
    - write Inventory(type="refund") logs
    - track cumulative refunded_qty on each order_item to prevent over-refund
    """
    order = _get_checked_out_order_or_409(order_id, db)
    order_items = list(db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all())
    if not order_items:
        raise HTTPException(422, "Order is empty")

    by_item_id = {it.id: it for it in order_items}
    request_qty_by_item: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for row in payload.items:
        request_qty_by_item[row.item_id] += row.qty

    if not request_qty_by_item:
        raise HTTPException(422, "Refund items is empty")

    lines: list[OrderRefundLineOut] = []
    refund_total = Decimal("0")
    note_tail = f" · {payload.note.strip()}" if payload.note and payload.note.strip() else ""

    try:
        for item_id, req_qty in request_qty_by_item.items():
            item = by_item_id.get(item_id)
            if item is None:
                raise HTTPException(404, f"Order item not found: {item_id}")
            if req_qty <= 0:
                raise HTTPException(422, "Refund qty must be > 0")

            sold_qty = item.qty or Decimal("0")
            refunded_qty = item.refunded_qty or Decimal("0")
            refundable_qty = sold_qty - refunded_qty
            if sold_qty <= 0:
                raise HTTPException(422, f"Invalid sold qty at item {item.id}")
            if refundable_qty <= 0:
                raise HTTPException(409, f"Item {item.id} has no refundable quantity left")
            if req_qty > refundable_qty:
                raise HTTPException(409, f"Refund qty exceeds refundable qty at item {item.id}")

            # Proportional refund amount from the original net line_total.
            line_refund_amount = (item.line_total / sold_qty) * req_qty
            inventory_note = f"refund order {order.id} item {item.id}{note_tail}"

            if item.pricing_mode == "normal":
                variant = _assert_sellable_variant(db.get(Product, item.variant_id))
                if variant.stock is None:
                    variant.stock = Decimal("0")
                variant.stock += req_qty
                db.add(
                    Inventory(
                        type="refund",
                        variant_id=variant.id,
                        qty=req_qty,
                        note=inventory_note,
                    )
                )

            elif item.pricing_mode == "meter":
                if item.stock_unit_id is None:
                    raise HTTPException(422, f"Missing stock_unit_id at item {item.id}")
                su = db.get(StockUnit, item.stock_unit_id)
                variant = _assert_sellable_variant(db.get(Product, item.variant_id))
                if su is None:
                    raise HTTPException(404, "Stock Unit not found")
                if su.variant_id != variant.id:
                    raise HTTPException(422, "Variant/StockUnit Mismatched")

                new_remaining = su.remaining_qty + req_qty
                if new_remaining > su.initial_qty:
                    raise HTTPException(409, f"Cannot refund item {item.id}: stock unit would exceed initial_qty")
                su.remaining_qty = new_remaining
                su.is_depleted = su.remaining_qty <= 0

                if variant.stock is None:
                    variant.stock = Decimal("0")
                variant.stock += req_qty

                db.add(
                    Inventory(
                        type="refund",
                        variant_id=variant.id,
                        stock_unit_id=su.id,
                        to_location_id=su.location_id,
                        qty=req_qty,
                        note=inventory_note,
                    )
                )

            elif item.pricing_mode == "roll":
                # Roll line in current design is always 1 full roll.
                if sold_qty != Decimal("1") or req_qty != Decimal("1"):
                    raise HTTPException(422, f"Roll refund currently supports full-line refund only (item {item.id})")
                if item.stock_unit_id is None:
                    raise HTTPException(422, f"Missing stock_unit_id at item {item.id}")
                su = db.get(StockUnit, item.stock_unit_id)
                variant = _assert_sellable_variant(db.get(Product, item.variant_id))
                if su is None:
                    raise HTTPException(404, "Stock Unit not found")
                if su.variant_id != variant.id:
                    raise HTTPException(422, "Variant/StockUnit Mismatched")

                restore_qty = su.initial_qty
                new_remaining = su.remaining_qty + restore_qty
                if new_remaining > su.initial_qty:
                    raise HTTPException(409, f"Cannot refund item {item.id}: stock unit has changed")
                su.remaining_qty = new_remaining
                su.is_depleted = su.remaining_qty <= 0

                if variant.stock is None:
                    variant.stock = Decimal("0")
                variant.stock += restore_qty

                db.add(
                    Inventory(
                        type="refund",
                        variant_id=variant.id,
                        stock_unit_id=su.id,
                        to_location_id=su.location_id,
                        qty=restore_qty,
                        note=inventory_note,
                    )
                )

            else:
                raise HTTPException(422, f"Invalid pricing mode at item {item.id}")

            item.refunded_qty = refunded_qty + req_qty
            refund_total += line_refund_amount
            lines.append(
                OrderRefundLineOut(
                    item_id=item.id,
                    refunded_qty=req_qty,
                    refund_amount=line_refund_amount,
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        raise

    return OrderRefundOut(order_id=order.id, refund_total=refund_total, lines=lines)


@router.post("/{order_id}/void", response_model=OrderOut)
def void_order(order_id: int, db: Session = Depends(get_db)):
    """
    Void an already checked-out order:
    - restores inventory back (reverse of checkout)
    - writes Inventory(type="void") rows for audit
    - sets order.status="voided"
    """
    order = _get_checked_out_order_or_409(order_id, db)

    items = list(db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all())
    if not items:
        raise HTTPException(422, "Order is empty")

    try:
        for item in items:
            if item.pricing_mode == "normal":
                variant = _assert_sellable_variant(db.get(Product, item.variant_id))
                if variant.track_stock_unit:
                    raise HTTPException(422, "Incorrect pricing mode")
                if variant.stock is None:
                    variant.stock = Decimal("0")
                variant.stock += item.qty
                db.add(
                    Inventory(
                        type="void",
                        variant_id=variant.id,
                        qty=item.qty,
                        note=f"void order {order.id}",
                    )
                )

            elif item.pricing_mode == "meter":
                if item.stock_unit_id is None:
                    raise HTTPException(422, "Missing stock_unit_id")
                su = db.get(StockUnit, item.stock_unit_id)
                variant = _assert_sellable_variant(db.get(Product, item.variant_id))
                if su is None:
                    raise HTTPException(404, "Stock Unit not found")
                if not variant.track_stock_unit:
                    raise HTTPException(422, "Incorrect pricing mode")
                if su.variant_id != variant.id:
                    raise HTTPException(422, "Variant/StockUnit Mismatched")

                new_remaining = su.remaining_qty + item.qty
                if new_remaining > su.initial_qty:
                    raise HTTPException(409, "Cannot void: would exceed initial_qty")
                su.remaining_qty = new_remaining
                su.is_depleted = su.remaining_qty <= 0

                if variant.stock is None:
                    variant.stock = Decimal("0")
                variant.stock += item.qty

                db.add(
                    Inventory(
                        type="void",
                        variant_id=variant.id,
                        stock_unit_id=su.id,
                        to_location_id=su.location_id,
                        qty=item.qty,
                        note=f"void order {order.id}",
                    )
                )

            elif item.pricing_mode == "roll":
                if item.stock_unit_id is None:
                    raise HTTPException(422, "Missing stock_unit_id")
                su = db.get(StockUnit, item.stock_unit_id)
                variant = _assert_sellable_variant(db.get(Product, item.variant_id))
                if su is None:
                    raise HTTPException(404, "Stock Unit not found")
                if not variant.track_stock_unit:
                    raise HTTPException(422, "Incorrect pricing mode")
                if su.variant_id != variant.id:
                    raise HTTPException(422, "Variant/StockUnit Mismatched")

                # At checkout we set remaining to 0 for full-roll sale.
                if su.remaining_qty != 0:
                    raise HTTPException(409, "Cannot void: stock unit has changed")

                qty_inventory_m = su.initial_qty
                su.remaining_qty = qty_inventory_m
                su.is_depleted = False

                if variant.stock is None:
                    variant.stock = Decimal("0")
                variant.stock += qty_inventory_m

                db.add(
                    Inventory(
                        type="void",
                        variant_id=variant.id,
                        stock_unit_id=su.id,
                        to_location_id=su.location_id,
                        qty=qty_inventory_m,
                        note=f"void order {order.id}",
                    )
                )

            else:
                raise HTTPException(422, "Invalid pricing mode")

        order.status = "voided"
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(order)
    return order
    
