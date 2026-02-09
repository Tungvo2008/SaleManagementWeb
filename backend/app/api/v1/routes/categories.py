from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def list_categories():
    return [{"id": 1, "name": "demo"}]
