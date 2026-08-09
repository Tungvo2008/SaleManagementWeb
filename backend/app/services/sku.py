from __future__ import annotations

import re
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.product import Product


def sku_from_name(name: str) -> str:
    """Create a compact ASCII SKU while preserving the name's letter casing."""
    normalized = unicodedata.normalize("NFD", str(name or ""))
    ascii_name = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    ascii_name = ascii_name.replace("đ", "d").replace("Đ", "D")
    return re.sub(r"[^a-zA-Z0-9]+", "", ascii_name)[:64]


def resolve_unique_sku(
    db: Session,
    *,
    name: str,
    requested_sku: str | None,
    exclude_id: int | None = None,
) -> str:
    requested = str(requested_sku or "").strip()
    if requested:
        return requested

    base = sku_from_name(name) or "sanpham"
    candidate = base
    suffix = 2
    while True:
        query = select(Product.id).where(func.lower(Product.sku) == candidate.lower())
        if exclude_id is not None:
            query = query.where(Product.id != exclude_id)
        if db.scalars(query).first() is None:
            return candidate
        suffix_text = str(suffix)
        candidate = f"{base[: 64 - len(suffix_text)]}{suffix_text}"
        suffix += 1
