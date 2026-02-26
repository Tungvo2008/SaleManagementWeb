from sqlalchemy import case, func, select
from sqlalchemy.orm import aliased, Session
from fastapi import APIRouter, Depends

from app.db.deps import get_db
from app.models.product import Product, sellable_product_clause
from app.models.stock_unit import StockUnit
from app.schemas.inventory import InventoryQueryOut


router = APIRouter()


@router.get("/", response_model=list[InventoryQueryOut])
def list_variant_stock(db: Session = Depends(get_db)):
    Parent = aliased(Product)

    # Product.stock is treated as the "sellable qty" (in Product.uom).
    # For roll-tracked variants, app keeps Product.stock in sync with StockUnit.remaining_qty.
    stock = func.coalesce(Product.stock, 0)

    rolls_total = func.coalesce(func.sum(case((StockUnit.remaining_qty > 0, 1), else_=0)), 0)
    rolls_full = func.coalesce(
        func.sum(
            case(
                (((StockUnit.remaining_qty > 0) & (StockUnit.remaining_qty == StockUnit.initial_qty)), 1),
                else_=0,
            )
        ),
        0,
    )
    rolls_partial = func.coalesce(
        func.sum(
            case(
                (((StockUnit.remaining_qty > 0) & (StockUnit.remaining_qty < StockUnit.initial_qty)), 1),
                else_=0,
            )
        ),
        0,
    )

    q = (
        select(
            Product.id.label("variant_id"),
            Product.parent_id.label("parent_id"),
            func.coalesce(Parent.name, Product.name).label("parent_name"),
            Product.sku.label("sku"),
            Product.name.label("name"),
            Product.uom.label("uom"),
            stock.label("stock"),
            Product.cost_price.label("cost_price"),
            rolls_total.label("rolls_total"),
            rolls_full.label("rolls_full"),
            rolls_partial.label("rolls_partial"),
        )
        .outerjoin(Parent, Parent.id == Product.parent_id)
        .outerjoin(StockUnit, StockUnit.variant_id == Product.id)
        .where(sellable_product_clause(Product))
        .group_by(
            Product.id,
            Product.parent_id,
            Parent.name,
            Product.sku,
            Product.name,
            Product.uom,
            Product.stock,
            Product.cost_price,
            Product.track_stock_unit,
        )
        .order_by(Product.id.desc())
    )

    rows = db.execute(q).mappings().all()
    return [InventoryQueryOut(**r) for r in rows]
