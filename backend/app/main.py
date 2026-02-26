from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from pathlib import Path
from app.api.v1.router import api_router
import app.models  # register all models
from app.core.audit import audit_context_middleware

app = FastAPI(title="Warehouse Backend", version="0.1.0")

# Local file uploads (dev/MVP): store files on disk and serve them back via /uploads/*
BACKEND_ROOT = Path(__file__).resolve().parents[1]
UPLOADS_DIR = BACKEND_ROOT / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Dev-friendly CORS:
# - Frontend typically runs on :3000 (CRA).
# - We also allow 127.0.0.1 to avoid "localhost vs 127.0.0.1" surprises.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(audit_context_middleware)
app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"status": "ok"}
