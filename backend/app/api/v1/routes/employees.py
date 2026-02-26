from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import current_user
from app.core.security import hash_password
from app.db.deps import get_db
from app.models.user import User
from app.schemas.employee import EmployeeCreate, EmployeeOut, EmployeeUpdate


router = APIRouter()


@router.get("/", response_model=list[EmployeeOut])
def list_employees(q: str = "", limit: int = 200, db: Session = Depends(get_db), _: User = Depends(current_user)):
    qq = (q or "").strip()
    stmt = select(User).order_by(User.id.desc()).limit(max(1, min(int(limit or 200), 1000)))
    if qq:
        stmt = stmt.where(User.username.ilike(f"%{qq}%"))
    return list(db.scalars(stmt).all())


@router.post("/", response_model=EmployeeOut)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db), _: User = Depends(current_user)):
    existed = db.scalars(select(User).where(User.username == payload.username.strip())).first()
    if existed is not None:
        raise HTTPException(409, "Username already exists")

    obj = User(
        username=payload.username.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    obj = db.get(User, employee_id)
    if obj is None:
        raise HTTPException(404, "Employee not found")

    data = payload.model_dump(exclude_unset=True)

    if "username" in data and data["username"] is not None:
        name = data["username"].strip()
        existed = db.scalars(select(User).where(User.username == name, User.id != employee_id)).first()
        if existed is not None:
            raise HTTPException(409, "Username already exists")
        obj.username = name

    if "password" in data and data["password"]:
        obj.password_hash = hash_password(data["password"])

    if "role" in data and data["role"] is not None:
        if obj.id == actor.id and data["role"] != "admin":
            raise HTTPException(422, "Cannot remove your own admin role")
        obj.role = data["role"]

    if "is_active" in data and data["is_active"] is not None:
        if obj.id == actor.id and data["is_active"] is False:
            raise HTTPException(422, "Cannot deactivate your own account")
        obj.is_active = data["is_active"]

    db.commit()
    db.refresh(obj)
    return obj
