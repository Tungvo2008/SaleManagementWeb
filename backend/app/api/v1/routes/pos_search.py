from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import aliased, Session

from app.db.deps import get_db
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.product import Product, is_sellable_product, sellable_product_clause
from app.models.stock_unit import StockUnit
from app.models.category import Category
from app.schemas.pos_search import (
    PosSearchOut,
    PosSearchStockUnitOut,
    PosSearchVariantOut,
)


router = APIRouter(prefix="/search")


def _d(v: object) -> Decimal:
    return Decimal(str(v))


@router.get("/", response_model=PosSearchOut)
def search(
    q: str = "",
    limit: int = 200,
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    """
    Unified POS search:
    - If q matches a StockUnit.barcode exactly => return stock_unit info (for scan flow)
    - Always returns variant search results by sku/name contains q (for typeahead)
    """
    q = (q or "").strip()

    # Exact barcode match (scan)
    su = db.scalars(select(StockUnit).where(StockUnit.barcode == q)).first() if q else None
    stock_unit_out = None
    if su is not None:
        v = db.get(Product, su.variant_id)

        reserved = db.execute(
            select(OrderItem.id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.status == "draft",
                OrderItem.stock_unit_id == su.id,
            )
            .limit(1)
        ).first()

        if is_sellable_product(v) and v.is_active:
            stock_unit_out = PosSearchStockUnitOut(
                stock_unit_id=su.id,
                barcode=su.barcode or "",
                variant_id=v.id,
                sku=v.sku,
                variant_name=v.name,
                uom=v.uom,
                price=_d(v.price) if v.price is not None else None,
                roll_price=_d(v.roll_price) if v.roll_price is not None else None,
                remaining_qty=_d(su.remaining_qty),
                initial_qty=_d(su.initial_qty),
                is_full_roll=(su.remaining_qty == su.initial_qty and su.remaining_qty > 0),
                location_id=su.location_id,
                is_reserved=bool(reserved),
            )

    # Variant list search (typeahead)
    Parent = aliased(Product)
    ParentCategory = aliased(Category)

    q_lower = q.lower()
    name_l = func.lower(Product.name)
    sku_l = func.lower(func.coalesce(Product.sku, ""))
    barcode_l = func.lower(func.coalesce(Product.barcode, ""))

    # If user is scanning normal goods, we want exact matches first.
    exact_rank = case(
        (barcode_l == q_lower, 3),
        (sku_l == q_lower, 2),
        (name_l == q_lower, 1),
        else_=0,
    )

    is_partial = case(
        (((StockUnit.remaining_qty > 0) & (StockUnit.remaining_qty < StockUnit.initial_qty)), 1),
        else_=0,
    )
    rolls_total = func.coalesce(func.sum(case((StockUnit.remaining_qty > 0, 1), else_=0)), 0)
    rolls_full = func.coalesce(func.sum(case(((StockUnit.remaining_qty > 0) & (StockUnit.remaining_qty == StockUnit.initial_qty), 1), else_=0)), 0)
    rolls_partial = func.coalesce(func.sum(case(((StockUnit.remaining_qty > 0) & (StockUnit.remaining_qty < StockUnit.initial_qty), 1), else_=0)), 0)

    category_expr = func.coalesce(Parent.category_id, Product.category_id)

    filters = [
        sellable_product_clause(Product),
        Product.is_active.is_(True),
    ]
    if category_id is not None:
        filters.append(category_expr == category_id)
    if q_lower:
        filters.append(
            or_(
                name_l.like(f"%{q_lower}%"),
                sku_l.like(f"%{q_lower}%"),
                barcode_l.like(f"%{q_lower}%"),
            )
        )

    qv = (
        select(
            Product.id.label("variant_id"),
            Product.parent_id.label("parent_id"),
            Parent.name.label("parent_name"),
            category_expr.label("parent_category_id"),
            ParentCategory.name.label("parent_category_name"),
            Product.sku.label("sku"),
            Product.barcode.label("barcode"),
            Product.name.label("name"),
            Product.image_url.label("image_url"),
            Product.uom.label("uom"),
            Product.price.label("price"),
            Product.roll_price.label("roll_price"),
            Product.track_stock_unit.label("track_stock_unit"),
            func.coalesce(Product.stock, 0).label("stock"),
            rolls_total.label("rolls_total"),
            rolls_full.label("rolls_full"),
            rolls_partial.label("rolls_partial"),
        )
        .outerjoin(Parent, Parent.id == Product.parent_id)
        .outerjoin(ParentCategory, ParentCategory.id == category_expr)
        .outerjoin(StockUnit, StockUnit.variant_id == Product.id)
        .where(*filters)
        .group_by(
            Product.id,
            Product.parent_id,
            Product.category_id,
            Parent.name,
            Parent.category_id,
            ParentCategory.name,
            Product.sku,
            Product.barcode,
            Product.name,
            Product.image_url,
            Product.uom,
            Product.price,
            Product.roll_price,
            Product.track_stock_unit,
            Product.stock,
        )
    )
    if q_lower:
        qv = qv.order_by(
            exact_rank.desc(),
            is_partial.desc(),
            func.coalesce(Product.stock, 0).desc(),
            Product.id.desc(),
        )
    else:
        # Browse mode: show by id (newest first)
        qv = qv.order_by(Product.id.desc())

    if limit and limit > 0:
        qv = qv.limit(limit)

    rows = db.execute(qv).mappings().all()
    variants = [
        PosSearchVariantOut(
            variant_id=r["variant_id"],
            parent_id=r["parent_id"],
            parent_name=r["parent_name"],
            parent_category_id=r["parent_category_id"],
            parent_category_name=r["parent_category_name"],
            sku=r["sku"],
            barcode=r["barcode"],
            name=r["name"],
            image_url=r["image_url"],
            uom=r["uom"],
            price=_d(r["price"]) if r["price"] is not None else None,
            roll_price=_d(r["roll_price"]) if r["roll_price"] is not None else None,
            track_stock_unit=bool(r["track_stock_unit"]),
            stock=_d(r["stock"]),
            rolls_total=int(r["rolls_total"]),
            rolls_full=int(r["rolls_full"]),
            rolls_partial=int(r["rolls_partial"]),
        )
        for r in rows
    ]

    exact_variant = None
    if q_lower:
        for v in variants:
            if (v.barcode is not None and v.barcode.lower() == q_lower) or (
                v.sku is not None and v.sku.lower() == q_lower
            ):
                exact_variant = v
                break

    return PosSearchOut(q=q, stock_unit=stock_unit_out, exact_variant=exact_variant, variants=variants)
