from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.v1.routes.auth import require_admin, require_manager
from app.db.deps import get_db
from app.models.category import Category
from app.models.product import Product
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryOut

router = APIRouter()

@router.post("/", response_model=CategoryOut)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db), _=Depends(require_manager)):
    obj = Category(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Category name already exists")
    db.refresh(obj)
    return obj

@router.get("/", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return list(db.scalars(select(Category).order_by(Category.id.desc())).all())

@router.get("/{category_id}", response_model=CategoryOut)
def get_category(category_id: int, db: Session = Depends(get_db)):
    obj = db.get(Category, category_id)
    if not obj:
        raise HTTPException(404, "Category not found")
    return obj

@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db), _=Depends(require_manager)):
    obj = db.get(Category, category_id)
    if not obj:
        raise HTTPException(404, "Category not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(obj, k, v)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Category name already exists")
    db.refresh(obj)
    return obj

@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    obj = db.get(Category, category_id)
    if not obj:
        raise HTTPException(404, "Category not found")

    used_by_product = db.scalars(
        select(Product.id).where(Product.category_id == category_id).limit(1)
    ).first()
    if used_by_product:
        raise HTTPException(409, "Cannot delete category that is used by products")

    db.delete(obj)
    db.commit()
    return {"deleted": True}
