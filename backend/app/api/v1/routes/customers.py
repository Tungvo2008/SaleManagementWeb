from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import require_admin, require_manager
from app.db.deps import get_db
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate


router = APIRouter()


def _normalize(s: str) -> str:
    return (s or "").strip()


@router.get("/", response_model=list[CustomerOut])
def list_customers(
    q: str = "",
    limit: int = 200,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    q = _normalize(q)
    stmt = select(Customer)
    if is_active is not None:
        stmt = stmt.where(Customer.is_active == is_active)
    if q:
        ql = q.lower()
        stmt = stmt.where(
            or_(
                func.lower(Customer.name).like(f"%{ql}%"),
                func.lower(func.coalesce(Customer.code, "")).like(f"%{ql}%"),
                func.lower(func.coalesce(Customer.phone, "")).like(f"%{ql}%"),
                func.lower(func.coalesce(Customer.email, "")).like(f"%{ql}%"),
            )
        )
    stmt = stmt.order_by(Customer.id.desc()).limit(max(1, min(int(limit or 200), 1000)))
    return list(db.scalars(stmt).all())


@router.post("/", response_model=CustomerOut)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()

    if data.get("code"):
        exists = db.scalars(select(Customer.id).where(Customer.code == data["code"])).first()
        if exists:
            raise HTTPException(409, "Customer code already exists")
    if data.get("phone"):
        exists = db.scalars(select(Customer.id).where(Customer.phone == data["phone"])).first()
        if exists:
            raise HTTPException(409, "Customer phone already exists")

    obj = Customer(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    obj = db.get(Customer, customer_id)
    if obj is None:
        raise HTTPException(404, "Customer not found")
    return obj


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_manager),
):
    obj = db.get(Customer, customer_id)
    if obj is None:
        raise HTTPException(404, "Customer not found")

    data = payload.model_dump(exclude_unset=True)

    if "code" in data and data["code"]:
        exists = db.scalars(
            select(Customer.id).where(Customer.code == data["code"], Customer.id != obj.id)
        ).first()
        if exists:
            raise HTTPException(409, "Customer code already exists")
    if "phone" in data and data["phone"]:
        exists = db.scalars(
            select(Customer.id).where(Customer.phone == data["phone"], Customer.id != obj.id)
        ).first()
        if exists:
            raise HTTPException(409, "Customer phone already exists")

    for k, v in data.items():
        setattr(obj, k, v)

    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    obj = db.get(Customer, customer_id)
    if obj is None:
        raise HTTPException(404, "Customer not found")
    db.delete(obj)
    db.commit()
    return {"ok": True}
