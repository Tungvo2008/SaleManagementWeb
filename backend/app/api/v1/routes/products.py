from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from app.api.v1.routes.auth import require_admin
from app.db.deps import get_db
from app.models.category import Category
from app.models.price_history import PriceHistory
from app.models.product import (
    Product,
    is_parent_container,
    is_sellable_product,
    parent_container_clause,
    sellable_product_clause,
)
from app.schemas.price_history import PriceHistoryOut
from app.schemas.product import (
    ParentCreate, ParentUpdate, ParentOut, ParentWithVariants,
    VariantCreate, VariantUpdate, VariantOut
)
from app.services.pricing import record_price_change

router = APIRouter()


def _assert_category_exists(db: Session, category_id: int | None) -> None:
    if category_id is None:
        return
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(404, "Category not found")


def _require_variant_fields(*, sku, uom, price) -> tuple[str, str]:
    next_sku = str(sku or "").strip()
    next_uom = str(uom or "").strip()
    if not next_sku:
        raise HTTPException(422, "SKU is required")
    if not next_uom:
        raise HTTPException(422, "uom is required")
    if price is None:
        raise HTTPException(422, "price is required")
    return next_sku, next_uom


def _record_variant_price_fields(
    db: Session,
    *,
    variant_id: int,
    source: str,
    old_price,
    new_price,
    old_roll_price,
    new_roll_price,
    old_cost_price,
    new_cost_price,
) -> None:
    record_price_change(
        db,
        variant_id=variant_id,
        field="price",
        old_value=old_price,
        new_value=new_price,
        source=source,
    )
    record_price_change(
        db,
        variant_id=variant_id,
        field="roll_price",
        old_value=old_roll_price,
        new_value=new_roll_price,
        source=source,
    )
    record_price_change(
        db,
        variant_id=variant_id,
        field="cost_price",
        old_value=old_cost_price,
        new_value=new_cost_price,
        source=source,
    )


# -------- PARENTS --------
@router.post("/parents", response_model=ParentOut)
def create_parent(payload: ParentCreate, db: Session = Depends(get_db)):
    _assert_category_exists(db, payload.category_id)

    parent = Product(
        parent_id=None,
        name=payload.name,
        description=payload.description,
        image_url=payload.image_url,
        category_id=payload.category_id,
        # parent: fields child-only để None
        price=None, roll_price=None, cost_price=None, stock=None, sku=None, attrs=None,
        is_active=True,
    )
    db.add(parent)
    db.commit()
    db.refresh(parent)
    return parent

@router.get("/parents", response_model=list[ParentOut])
def list_parents(db: Session = Depends(get_db)):
    q = select(Product).where(parent_container_clause(Product)).order_by(Product.id.desc())
    return list(db.scalars(q).all())

@router.get("/parents/{parent_id}", response_model=ParentWithVariants)
def get_parent(parent_id: int, db: Session = Depends(get_db)):
    q = (
        select(Product)
        .where(Product.id == parent_id, parent_container_clause(Product))
        .options(selectinload(Product.variants))
    )
    parent = db.scalars(q).first()
    if not parent:
        raise HTTPException(404, "Parent product not found")
    return parent

@router.patch("/parents/{parent_id}", response_model=ParentOut)
def update_parent(parent_id: int, payload: ParentUpdate, db: Session = Depends(get_db)):
    parent = db.get(Product, parent_id)
    if not is_parent_container(parent):
        raise HTTPException(404, "Parent product not found")

    data = payload.model_dump(exclude_unset=True)
    _assert_category_exists(db, data.get("category_id"))

    # chặn sửa child-only fields ở parent (để khỏi lẫn)
    blocked = {"price", "roll_price", "cost_price", "stock", "sku", "attrs", "parent_id"}
    for k in blocked:
        data.pop(k, None)

    for k, v in data.items():
        setattr(parent, k, v)

    db.commit()
    db.refresh(parent)
    return parent

@router.delete("/parents/{parent_id}")
def delete_parent(parent_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    parent = db.get(Product, parent_id)
    if not is_parent_container(parent):
        raise HTTPException(404, "Parent product not found")

    # cascade delete variants (đã set cascade ở relationship)
    db.delete(parent)
    db.commit()
    return {"deleted": True}

# -------- VARIANTS (CHILD) --------
@router.post("/parents/{parent_id}/variants", response_model=VariantOut)
def create_variant(parent_id: int, payload: VariantCreate, db: Session = Depends(get_db)):
    parent = db.get(Product, parent_id)
    if not is_parent_container(parent):
        raise HTTPException(404, "Parent product not found")

    sku, uom = _require_variant_fields(sku=payload.sku, uom=payload.uom, price=payload.price)

    exists = db.scalars(select(Product.id).where(Product.sku == sku)).first()
    if exists:
        raise HTTPException(409, "SKU already exists")

    # barcode nếu có phải unique
    if payload.barcode:
        exists = db.scalars(select(Product.id).where(Product.barcode == payload.barcode)).first()
        if exists:
            raise HTTPException(409, "Barcode already exists")

    child = Product(
        parent_id=parent_id,
        category_id=None,  # inherit từ parent về logic, DB không cần set
        name=payload.name,
        description=payload.description,
        image_url=payload.image_url,
        price=payload.price,
        roll_price=payload.roll_price,
        cost_price=payload.cost_price,
        uom=uom,
        stock=payload.stock,
        sku=sku,
        barcode=payload.barcode,
        attrs=payload.attrs,
        track_stock_unit=payload.track_stock_unit,
        is_active=payload.is_active,
    )
    db.add(child)
    db.flush()  # get child.id for price history
    _record_variant_price_fields(
        db,
        variant_id=child.id,
        source="variant_create",
        old_price=None,
        new_price=child.price,
        old_roll_price=None,
        new_roll_price=child.roll_price,
        old_cost_price=None,
        new_cost_price=child.cost_price,
    )
    db.commit()
    db.refresh(child)
    return child


@router.post("/variants", response_model=VariantOut)
def create_standalone_variant(payload: VariantCreate, db: Session = Depends(get_db)):
    """
    Standalone sellable product (no parent container).
    Used when shop does not need parent/variation grouping.
    """
    _assert_category_exists(db, payload.category_id)

    sku, uom = _require_variant_fields(sku=payload.sku, uom=payload.uom, price=payload.price)

    exists = db.scalars(select(Product.id).where(Product.sku == sku)).first()
    if exists:
        raise HTTPException(409, "SKU already exists")

    if payload.barcode:
        exists = db.scalars(select(Product.id).where(Product.barcode == payload.barcode)).first()
        if exists:
            raise HTTPException(409, "Barcode already exists")

    obj = Product(
        parent_id=None,
        category_id=payload.category_id,
        name=payload.name,
        description=payload.description,
        image_url=payload.image_url,
        price=payload.price,
        roll_price=payload.roll_price,
        cost_price=payload.cost_price,
        uom=uom,
        stock=payload.stock,
        sku=sku,
        barcode=payload.barcode,
        attrs=payload.attrs,
        track_stock_unit=payload.track_stock_unit,
        is_active=payload.is_active,
    )
    db.add(obj)
    db.flush()  # get obj.id for price history
    _record_variant_price_fields(
        db,
        variant_id=obj.id,
        source="variant_create",
        old_price=None,
        new_price=obj.price,
        old_roll_price=None,
        new_roll_price=obj.roll_price,
        old_cost_price=None,
        new_cost_price=obj.cost_price,
    )
    db.commit()
    db.refresh(obj)
    return obj

@router.get("/variants", response_model=list[VariantOut])
def list_variants(db: Session = Depends(get_db)):
    q = select(Product).where(sellable_product_clause(Product)).order_by(Product.id.desc())
    return list(db.scalars(q).all())


@router.get("/price-history", response_model=list[PriceHistoryOut])
def list_price_history(
    variant_id: int | None = None,
    field: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = select(PriceHistory).order_by(PriceHistory.id.desc())

    if variant_id is not None:
        q = q.where(PriceHistory.variant_id == variant_id)
    if field is not None and field.strip():
        q = q.where(PriceHistory.field == field.strip())

    safe_limit = max(1, min(int(limit or 200), 1000))
    q = q.limit(safe_limit)
    return list(db.scalars(q).all())

@router.get("/variants/{variant_id}", response_model=VariantOut)
def get_variant(variant_id: int, db: Session = Depends(get_db)):
    v = db.get(Product, variant_id)
    if not is_sellable_product(v):
        raise HTTPException(404, "Variant not found")
    return v

@router.patch("/variants/{variant_id}", response_model=VariantOut)
def update_variant(variant_id: int, payload: VariantUpdate, db: Session = Depends(get_db)):
    v = db.get(Product, variant_id)
    if not is_sellable_product(v):
        raise HTTPException(404, "Variant not found")

    old_price = v.price
    old_roll_price = v.roll_price
    old_cost_price = v.cost_price

    data = payload.model_dump(exclude_unset=True)

    # không cho đổi parent_id qua endpoint này (đổi variation group là chuyện khác)
    data.pop("parent_id", None)
    if v.parent_id is not None:
        data.pop("category_id", None)  # child inherits category from parent
    else:
        _assert_category_exists(db, data.get("category_id"))

    next_sku, next_uom = _require_variant_fields(
        sku=data.get("sku", v.sku),
        uom=data.get("uom", v.uom),
        price=data.get("price", v.price),
    )
    data["sku"] = next_sku
    data["uom"] = next_uom

    # nếu đổi sku thì check unique
    exists = db.scalars(select(Product.id).where(Product.sku == data["sku"], Product.id != variant_id)).first()
    if exists:
        raise HTTPException(409, "SKU already exists")

    # nếu đổi barcode thì check unique
    if "barcode" in data and data["barcode"]:
        exists = db.scalars(
            select(Product.id).where(Product.barcode == data["barcode"], Product.id != variant_id)
        ).first()
        if exists:
            raise HTTPException(409, "Barcode already exists")

    for k, v2 in data.items():
        setattr(v, k, v2)

    _record_variant_price_fields(
        db,
        variant_id=v.id,
        source="variant_update",
        old_price=old_price,
        new_price=v.price,
        old_roll_price=old_roll_price,
        new_roll_price=v.roll_price,
        old_cost_price=old_cost_price,
        new_cost_price=v.cost_price,
    )

    db.commit()
    db.refresh(v)
    return v

@router.delete("/variants/{variant_id}")
def delete_variant(variant_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    v = db.get(Product, variant_id)
    if not is_sellable_product(v):
        raise HTTPException(404, "Variant not found")
    db.delete(v)
    db.commit()
    return {"deleted": True}
