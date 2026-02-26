from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.deps import get_db
from app.models.location import Location
from app.models.product import Product
from app.schemas.location import LocationCreate, LocationUpdate, LocationOut

router = APIRouter()

@router.get("/", response_model=list[LocationOut])
def list_locations(db: Session = Depends(get_db)):
    r = db.query(Location).all()
    return r

@router.get("/{location_id}", response_model=LocationOut)
def get_location(location_id: int, db : Session = Depends(get_db)):
    obj = db.get(Location, location_id)
    if not obj:
        raise HTTPException(404, "Location not found")
    return obj

@router.post("/", response_model=LocationOut)
def create_location(payload: LocationCreate, db: Session = Depends(get_db)):
    obj = Location(**payload.model_dump())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Location code already exists")
    db.refresh(obj)
    return obj