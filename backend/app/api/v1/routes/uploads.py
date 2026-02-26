from __future__ import annotations

from pathlib import Path
from uuid import uuid4
import shutil
import base64

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

BACKEND_ROOT = Path(__file__).resolve().parents[4]
IMAGES_DIR = BACKEND_ROOT / "uploads" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

_CT_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

_ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

MAX_IMAGE_BYTES = 6 * 1024 * 1024  # 6MB (MVP)

class ImageUploadIn(BaseModel):
    # Support Data URL: data:image/png;base64,AAAA...
    # Or raw base64 (then filename/content_type should help us pick extension)
    data_url: str
    filename: str | None = None
    content_type: str | None = None


def _pick_ext(filename: str | None, content_type: str | None, data_url_prefix: str | None) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext == ".jpeg":
        ext = ".jpg"
    if ext in _ALLOWED_EXTS:
        return ext

    ct = (content_type or "").lower().strip()
    if ct in _CT_TO_EXT:
        return _CT_TO_EXT[ct]

    if data_url_prefix:
        # Example prefix: "data:image/png;base64"
        if data_url_prefix.startswith("data:image/"):
            ctp = data_url_prefix[len("data:") :].split(";")[0].strip().lower()
            if ctp in _CT_TO_EXT:
                return _CT_TO_EXT[ctp]

    return ""


@router.post("/images")
def upload_image(payload: ImageUploadIn):
    raw = (payload.data_url or "").strip()
    if not raw:
        raise HTTPException(422, "Thiếu dữ liệu ảnh")

    data_url_prefix = None
    b64 = raw
    if raw.startswith("data:"):
        # data:<mime>;base64,<data>
        try:
            header, b64 = raw.split(",", 1)
            data_url_prefix = header
        except ValueError:
            raise HTTPException(422, "Data URL không hợp lệ")

    ext = _pick_ext(payload.filename, payload.content_type, data_url_prefix)
    if not ext:
        raise HTTPException(415, "Chỉ hỗ trợ ảnh .jpg/.png/.webp")

    try:
        blob = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(422, "Base64 không hợp lệ")

    if len(blob) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"Ảnh quá lớn (tối đa {MAX_IMAGE_BYTES // (1024 * 1024)}MB)")

    name = f"{uuid4().hex}{ext}"
    dst = IMAGES_DIR / name
    with dst.open("wb") as f:
        f.write(blob)

    # Public URL served by StaticFiles mount in app/main.py
    return {"url": f"/uploads/images/{name}", "filename": name}
