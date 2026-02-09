from fastapi import FastAPI
from app.api.v1.router import api_router
from app.db.init_db import init_db



app = FastAPI(title="Warehouse Backend", version="0.1.0")
app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"status": "ok"}

@app.on_event("startup")
def on_startup():
    init_db()