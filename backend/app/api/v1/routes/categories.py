from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.deps import get_db
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryOut

router = APIRouter()

@router.post("/", response_model=CategoryOut)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    obj = Category(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Category name already exists or invalid")
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
def update_category(category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db)):
    obj = db.get(Category, category_id)
    if not obj:
        raise HTTPException(404, "Category not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(obj, k, v)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "Update failed (maybe duplicate name)")
    db.refresh(obj)
    return obj

@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    obj = db.get(Category, category_id)
    if not obj:
        raise HTTPException(404, "Category not found")
    db.delete(obj)
    db.commit()
    return {"deleted": True}
