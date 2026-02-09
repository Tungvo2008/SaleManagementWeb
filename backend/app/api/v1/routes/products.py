from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from app.db.deps import get_db
from app.models.product import Product
from app.schemas.product import (
    ParentCreate, ParentUpdate, ParentOut, ParentWithVariants,
    VariantCreate, VariantUpdate, VariantOut
)

router = APIRouter()

# -------- PARENTS --------
@router.post("/parents", response_model=ParentOut)
def create_parent(payload: ParentCreate, db: Session = Depends(get_db)):
    parent = Product(
        parent_id=None,
        name=payload.name,
        description=payload.description,
        image_url=payload.image_url,
        category_id=payload.category_id,
        # parent: fields child-only để None
        price=None, stock=None, sku=None, attrs=None,
        is_active=True,
    )
    db.add(parent)
    db.commit()
    db.refresh(parent)
    return parent

@router.get("/parents", response_model=list[ParentOut])
def list_parents(db: Session = Depends(get_db)):
    q = select(Product).where(Product.parent_id.is_(None)).order_by(Product.id.desc())
    return list(db.scalars(q).all())

@router.get("/parents/{parent_id}", response_model=ParentWithVariants)
def get_parent(parent_id: int, db: Session = Depends(get_db)):
    q = (
        select(Product)
        .where(Product.id == parent_id, Product.parent_id.is_(None))
        .options(selectinload(Product.variants))
    )
    parent = db.scalars(q).first()
    if not parent:
        raise HTTPException(404, "Parent product not found")
    return parent

@router.patch("/parents/{parent_id}", response_model=ParentOut)
def update_parent(parent_id: int, payload: ParentUpdate, db: Session = Depends(get_db)):
    parent = db.get(Product, parent_id)
    if not parent or parent.parent_id is not None:
        raise HTTPException(404, "Parent product not found")

    data = payload.model_dump(exclude_unset=True)
    # chặn sửa child-only fields ở parent (để khỏi lẫn)
    blocked = {"price", "stock", "sku", "attrs", "parent_id"}
    for k in blocked:
        data.pop(k, None)

    for k, v in data.items():
        setattr(parent, k, v)

    db.commit()
    db.refresh(parent)
    return parent

@router.delete("/parents/{parent_id}")
def delete_parent(parent_id: int, db: Session = Depends(get_db)):
    parent = db.get(Product, parent_id)
    if not parent or parent.parent_id is not None:
        raise HTTPException(404, "Parent product not found")

    # cascade delete variants (đã set cascade ở relationship)
    db.delete(parent)
    db.commit()
    return {"deleted": True}

# -------- VARIANTS (CHILD) --------
@router.post("/parents/{parent_id}/variants", response_model=VariantOut)
def create_variant(parent_id: int, payload: VariantCreate, db: Session = Depends(get_db)):
    parent = db.get(Product, parent_id)
    if not parent or parent.parent_id is not None:
        raise HTTPException(404, "Parent product not found")

    # sku nếu có phải unique
    if payload.sku:
        exists = db.scalars(select(Product.id).where(Product.sku == payload.sku)).first()
        if exists:
            raise HTTPException(400, "SKU already exists")

    child = Product(
        parent_id=parent_id,
        category_id=None,  # inherit từ parent về logic, DB không cần set
        name=payload.name,
        description=None,
        image_url=payload.image_url,
        price=payload.price,
        stock=payload.stock,
        sku=payload.sku,
        attrs=payload.attrs,
        is_active=payload.is_active,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    return child

@router.get("/variants", response_model=list[VariantOut])
def list_variants(db: Session = Depends(get_db)):
    q = select(Product).where(Product.parent_id.is_not(None)).order_by(Product.id.desc())
    return list(db.scalars(q).all())

@router.get("/variants/{variant_id}", response_model=VariantOut)
def get_variant(variant_id: int, db: Session = Depends(get_db)):
    v = db.get(Product, variant_id)
    if not v or v.parent_id is None:
        raise HTTPException(404, "Variant not found")
    return v

@router.patch("/variants/{variant_id}", response_model=VariantOut)
def update_variant(variant_id: int, payload: VariantUpdate, db: Session = Depends(get_db)):
    v = db.get(Product, variant_id)
    if not v or v.parent_id is None:
        raise HTTPException(404, "Variant not found")

    data = payload.model_dump(exclude_unset=True)

    # không cho đổi parent_id qua endpoint này (đổi variation group là chuyện khác)
    data.pop("parent_id", None)
    data.pop("category_id", None)  # child không set category trực tiếp

    # nếu đổi sku thì check unique
    if "sku" in data and data["sku"]:
        exists = db.scalars(select(Product.id).where(Product.sku == data["sku"], Product.id != variant_id)).first()
        if exists:
            raise HTTPException(400, "SKU already exists")

    for k, v2 in data.items():
        setattr(v, k, v2)

    db.commit()
    db.refresh(v)
    return v

@router.delete("/variants/{variant_id}")
def delete_variant(variant_id: int, db: Session = Depends(get_db)):
    v = db.get(Product, variant_id)
    if not v or v.parent_id is None:
        raise HTTPException(404, "Variant not found")
    db.delete(v)
    db.commit()
    return {"deleted": True}
