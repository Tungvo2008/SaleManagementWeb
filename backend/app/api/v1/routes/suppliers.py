from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import require_admin
from app.db.deps import get_db
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierOut, SupplierUpdate


router = APIRouter()


def _normalize(s: str) -> str:
    return (s or "").strip()


@router.get("/", response_model=list[SupplierOut])
def list_suppliers(
    q: str = "",
    limit: int = 200,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    q = _normalize(q)
    stmt = select(Supplier)
    if is_active is not None:
        stmt = stmt.where(Supplier.is_active == is_active)
    if q:
        ql = q.lower()
        stmt = stmt.where(
            or_(
                func.lower(Supplier.name).like(f"%{ql}%"),
                func.lower(func.coalesce(Supplier.code, "")).like(f"%{ql}%"),
                func.lower(func.coalesce(Supplier.phone, "")).like(f"%{ql}%"),
                func.lower(func.coalesce(Supplier.email, "")).like(f"%{ql}%"),
                func.lower(func.coalesce(Supplier.contact_name, "")).like(f"%{ql}%"),
            )
        )
    stmt = stmt.order_by(Supplier.id.desc()).limit(max(1, min(int(limit or 200), 1000)))
    return list(db.scalars(stmt).all())


@router.post("/", response_model=SupplierOut)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()

    if data.get("code"):
        exists = db.scalars(select(Supplier.id).where(Supplier.code == data["code"])).first()
        if exists:
            raise HTTPException(409, "Supplier code already exists")

    obj = Supplier(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    obj = db.get(Supplier, supplier_id)
    if obj is None:
        raise HTTPException(404, "Supplier not found")
    return obj


@router.patch("/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: int, payload: SupplierUpdate, db: Session = Depends(get_db)):
    obj = db.get(Supplier, supplier_id)
    if obj is None:
        raise HTTPException(404, "Supplier not found")

    data = payload.model_dump(exclude_unset=True)

    if "code" in data and data["code"]:
        exists = db.scalars(
            select(Supplier.id).where(Supplier.code == data["code"], Supplier.id != obj.id)
        ).first()
        if exists:
            raise HTTPException(409, "Supplier code already exists")

    for k, v in data.items():
        setattr(obj, k, v)

    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    obj = db.get(Supplier, supplier_id)
    if obj is None:
        raise HTTPException(404, "Supplier not found")
    db.delete(obj)
    db.commit()
    return {"ok": True}
