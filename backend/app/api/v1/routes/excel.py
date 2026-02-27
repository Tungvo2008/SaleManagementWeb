from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.category import Category
from app.models.customer import Customer
from app.models.location import Location
from app.models.product import Product, is_parent_container, is_sellable_product, sellable_product_clause, parent_container_clause
from app.models.stock_unit import StockUnit
from app.models.supplier import Supplier
from app.services.pricing import compute_moving_average_cost
from app.services.spreadsheetml import Sheet, build_workbook, parse_workbook


router = APIRouter()


def _as_int(v: str | None) -> int | None:
    if v is None or str(v).strip() == "":
        return None
    try:
        return int(str(v).strip())
    except Exception:
        return None


def _as_decimal(v: str | None) -> Decimal | None:
    if v is None or str(v).strip() == "":
        return None
    try:
        return Decimal(str(v).strip())
    except Exception:
        return None


def _as_bool(v: str | None) -> bool | None:
    if v is None or str(v).strip() == "":
        return None
    s = str(v).strip().lower()
    if s in {"1", "true", "yes", "y", "on", "có", "co"}:
        return True
    if s in {"0", "false", "no", "n", "off", "không", "khong"}:
        return False
    return None


def _as_date(v: str | None) -> date | None:
    if v is None or str(v).strip() == "":
        return None
    s = str(v).strip()
    try:
        # expected: YYYY-MM-DD
        return date.fromisoformat(s)
    except Exception:
        return None


def _err(*, sheet: str, row: dict[str, Any], field: str, msg: str) -> dict[str, Any]:
    return {
        "sheet": sheet,
        "row": int(row.get("__rownum__", "0") or 0),
        "field": field,
        "message": msg,
    }


def _download(filename: str, xml_text: str) -> Response:
    return Response(
        content=xml_text.encode("utf-8"),
        media_type="application/vnd.ms-excel; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/template")
def download_template() -> Response:
    """
    Download a SpreadsheetML (Excel 2003 XML) workbook template.
    Required fields are highlighted and marked with '*'.
    """
    sheets: list[Sheet] = [
        Sheet(
            name="Hướng_dẫn",
            columns=["ghi_chú"],
            required=set(),
            rows=[
                {
                    "ghi_chú": (
                        "1) File này là Excel 2003 XML (SpreadsheetML). "
                        "Nếu bạn dùng Excel, hãy lưu lại đúng định dạng: 'XML Spreadsheet 2003'.\n"
                        "2) Cột có dấu * là bắt buộc khi tạo mới.\n"
                        "3) Nếu có cột 'id': để trống = tạo mới; có id = cập nhật (MVP: ô trống sẽ không xoá dữ liệu cũ).\n"
                    )
                }
            ],
        ),
        Sheet(
            name="categories",
            columns=["id", "name", "description", "image_url"],
            required={"name"},
        ),
        Sheet(
            name="suppliers",
            columns=[
                "id",
                "code",
                "name",
                "phone",
                "email",
                "address",
                "contact_name",
                "tax_code",
                "bank_name",
                "bank_account",
                "bank_branch",
                "debt",
                "note",
                "is_active",
            ],
            required={"name"},
        ),
        Sheet(
            name="customers",
            columns=[
                "id",
                "code",
                "name",
                "phone",
                "email",
                "address",
                "tax_code",
                "gender",
                "birthday",
                "points",
                "debt",
                "note",
                "is_active",
            ],
            required={"name"},
        ),
        Sheet(
            name="locations",
            columns=["id", "code", "name", "note"],
            required={"code"},
        ),
        Sheet(
            name="product_parents",
            columns=["id", "name", "category_id", "description", "image_url", "is_active"],
            required={"name"},
        ),
        Sheet(
            name="product_variants",
            columns=[
                "id",
                "parent_id",
                "parent_name",
                "category_id",
                "category_name",
                "name",
                "description",
                "uom",
                "price",
                "roll_price",
                "cost_price",
                "stock",
                "sku",
                "barcode",
                "image_url",
                "attrs_json",
                "track_stock_unit",
                "is_active",
            ],
            required={"name", "price", "stock"},
        ),
        Sheet(
            name="stock_units",
            columns=[
                "id",
                "variant_id",
                "barcode",
                "location_id",
                "uom",
                "initial_qty",
                "remaining_qty",
                "cost_roll_price",
                "cost_per_m",
            ],
            required={"variant_id", "uom", "initial_qty", "remaining_qty"},
        ),
    ]
    xml_text = build_workbook(sheets=sheets)
    return _download("mau-nhap-du-lieu.xls", xml_text)


@router.get("/export/categories")
def export_categories(db: Session = Depends(get_db)) -> Response:
    cats = list(db.scalars(select(Category).order_by(Category.id.asc())).all())
    rows = [{"id": c.id, "name": c.name, "description": c.description, "image_url": c.image_url} for c in cats]
    xml_text = build_workbook(
        sheets=[Sheet(name="categories", columns=["id", "name", "description", "image_url"], required={"name"}, rows=rows)]
    )
    return _download("categories.xls", xml_text)


@router.get("/export/suppliers")
def export_suppliers(q: str | None = None, db: Session = Depends(get_db)) -> Response:
    s = select(Supplier).order_by(Supplier.id.desc())
    if q:
        like = f"%{q.strip()}%"
        s = s.where((Supplier.name.ilike(like)) | (Supplier.phone.ilike(like)) | (Supplier.code.ilike(like)))
    rows = []
    for it in db.scalars(s).all():
        rows.append(
            {
                "id": it.id,
                "code": it.code,
                "name": it.name,
                "phone": it.phone,
                "email": it.email,
                "address": it.address,
                "contact_name": it.contact_name,
                "tax_code": it.tax_code,
                "bank_name": it.bank_name,
                "bank_account": it.bank_account,
                "bank_branch": it.bank_branch,
                "debt": it.debt,
                "note": it.note,
                "is_active": 1 if it.is_active else 0,
            }
        )
    cols = [
        "id",
        "code",
        "name",
        "phone",
        "email",
        "address",
        "contact_name",
        "tax_code",
        "bank_name",
        "bank_account",
        "bank_branch",
        "debt",
        "note",
        "is_active",
    ]
    xml_text = build_workbook(sheets=[Sheet(name="suppliers", columns=cols, required={"name"}, rows=rows)])
    return _download("suppliers.xls", xml_text)


@router.get("/export/customers")
def export_customers(q: str | None = None, db: Session = Depends(get_db)) -> Response:
    s = select(Customer).order_by(Customer.id.desc())
    if q:
        like = f"%{q.strip()}%"
        s = s.where((Customer.name.ilike(like)) | (Customer.phone.ilike(like)) | (Customer.code.ilike(like)))
    rows = []
    for it in db.scalars(s).all():
        rows.append(
            {
                "id": it.id,
                "code": it.code,
                "name": it.name,
                "phone": it.phone,
                "email": it.email,
                "address": it.address,
                "tax_code": it.tax_code,
                "gender": it.gender,
                "birthday": it.birthday.isoformat() if it.birthday else None,
                "points": it.points,
                "debt": it.debt,
                "note": it.note,
                "is_active": 1 if it.is_active else 0,
            }
        )
    cols = [
        "id",
        "code",
        "name",
        "phone",
        "email",
        "address",
        "tax_code",
        "gender",
        "birthday",
        "points",
        "debt",
        "note",
        "is_active",
    ]
    xml_text = build_workbook(sheets=[Sheet(name="customers", columns=cols, required={"name"}, rows=rows)])
    return _download("customers.xls", xml_text)


@router.get("/export/locations")
def export_locations(db: Session = Depends(get_db)) -> Response:
    rows = [{"id": it.id, "code": it.code, "name": it.name, "note": it.note} for it in db.scalars(select(Location)).all()]
    xml_text = build_workbook(sheets=[Sheet(name="locations", columns=["id", "code", "name", "note"], required={"code"}, rows=rows)])
    return _download("locations.xls", xml_text)


@router.get("/export/products")
def export_products(q: str | None = None, category_id: int | None = None, db: Session = Depends(get_db)) -> Response:
    s = select(Product).where(sellable_product_clause(Product)).order_by(Product.id.desc())
    if q:
        like = f"%{q.strip()}%"
        s = s.where((Product.name.ilike(like)) | (Product.sku.ilike(like)) | (Product.barcode.ilike(like)))
    if category_id is not None:
        s = s.where(Product.category_id == category_id)
    rows = []
    for it in db.scalars(s).all():
        parent = it.parent
        cat = it.category
        rows.append(
            {
                "id": it.id,
                "parent_id": it.parent_id,
                "parent_name": parent.name if parent else None,
                "category_id": it.category_id,
                "category_name": cat.name if cat else None,
                "name": it.name,
                "description": it.description,
                "uom": it.uom,
                "price": it.price,
                "roll_price": it.roll_price,
                "cost_price": it.cost_price,
                "stock": it.stock,
                "sku": it.sku,
                "barcode": it.barcode,
                "image_url": it.image_url,
                "attrs_json": json.dumps(it.attrs or {}, ensure_ascii=False) if it.attrs else None,
                "track_stock_unit": 1 if it.track_stock_unit else 0,
                "is_active": 1 if it.is_active else 0,
            }
        )
    cols = [
        "id",
        "parent_id",
        "parent_name",
        "category_id",
        "category_name",
        "name",
        "description",
        "uom",
        "price",
        "roll_price",
        "cost_price",
        "stock",
        "sku",
        "barcode",
        "image_url",
        "attrs_json",
        "track_stock_unit",
        "is_active",
    ]
    xml_text = build_workbook(sheets=[Sheet(name="product_variants", columns=cols, required={"name", "price", "stock"}, rows=rows)])
    return _download("products.xls", xml_text)


@router.get("/export/stock_units")
def export_stock_units(variant_id: int | None = None, location_id: int | None = None, db: Session = Depends(get_db)) -> Response:
    s = select(StockUnit).order_by(StockUnit.id.desc())
    if variant_id is not None:
        s = s.where(StockUnit.variant_id == variant_id)
    if location_id is not None:
        s = s.where(StockUnit.location_id == location_id)
    rows = []
    for it in db.scalars(s).all():
        rows.append(
            {
                "id": it.id,
                "variant_id": it.variant_id,
                "barcode": it.barcode,
                "location_id": it.location_id,
                "uom": it.uom,
                "initial_qty": it.initial_qty,
                "remaining_qty": it.remaining_qty,
                "cost_roll_price": it.cost_roll_price,
                "cost_per_m": it.cost_per_m,
            }
        )
    cols = [
        "id",
        "variant_id",
        "barcode",
        "location_id",
        "uom",
        "initial_qty",
        "remaining_qty",
        "cost_roll_price",
        "cost_per_m",
    ]
    xml_text = build_workbook(sheets=[Sheet(name="stock_units", columns=cols, required={"variant_id", "uom", "initial_qty", "remaining_qty"}, rows=rows)])
    return _download("stock_units.xls", xml_text)


@router.post("/import")
async def import_workbook(file: UploadFile = File(...), db: Session = Depends(get_db)):
    raw = await file.read()
    if not raw:
        raise HTTPException(422, "File rỗng")

    try:
        wb = parse_workbook(raw)
    except Exception:
        raise HTTPException(422, "Không đọc được file. Hãy dùng định dạng: XML Spreadsheet 2003 (SpreadsheetML).")

    errors: list[dict[str, Any]] = []
    counts: dict[str, int] = {"created": 0, "updated": 0}

    # ----------------- Helpers: FK lookup -----------------
    def _cat_by_name(name: str) -> Category | None:
        return db.scalars(select(Category).where(Category.name == name).limit(1)).first()

    def _parent_by_name(name: str) -> Product | None:
        q = select(Product).where(parent_container_clause(Product), Product.name == name).limit(1)
        return db.scalars(q).first()

    # ----------------- Validate & apply -----------------
    # We validate all rows first (including FK existence), then apply in one transaction.
    # For MVP: on update, blank cells do NOT clear existing values (they are ignored).

    # Preload id sets for quick FK checks
    existing_category_ids = set(db.scalars(select(Category.id)).all())
    existing_location_ids = set(db.scalars(select(Location.id)).all())
    existing_variant_ids = set(db.scalars(select(Product.id).where(sellable_product_clause(Product))).all())
    existing_parent_ids = set(db.scalars(select(Product.id).where(parent_container_clause(Product))).all())

    # -------- categories --------
    for row in wb.get("categories", []):
        rid = _as_int(row.get("id"))
        name = (row.get("name") or "").strip() if row.get("name") else ""
        if rid is None and not name:
            errors.append(_err(sheet="categories", row=row, field="name", msg="Bắt buộc khi tạo mới"))
        if name and len(name) > 200:
            errors.append(_err(sheet="categories", row=row, field="name", msg="Tối đa 200 ký tự"))

    # -------- suppliers --------
    for row in wb.get("suppliers", []):
        rid = _as_int(row.get("id"))
        name = (row.get("name") or "").strip() if row.get("name") else ""
        if rid is None and not name:
            errors.append(_err(sheet="suppliers", row=row, field="name", msg="Bắt buộc khi tạo mới"))

    # -------- customers --------
    for row in wb.get("customers", []):
        rid = _as_int(row.get("id"))
        name = (row.get("name") or "").strip() if row.get("name") else ""
        if rid is None and not name:
            errors.append(_err(sheet="customers", row=row, field="name", msg="Bắt buộc khi tạo mới"))
        g = row.get("gender")
        if g and str(g).strip().lower() not in {"unknown", "male", "female", "other"}:
            errors.append(_err(sheet="customers", row=row, field="gender", msg="Giá trị hợp lệ: unknown/male/female/other"))
        if row.get("birthday") and _as_date(row.get("birthday")) is None:
            errors.append(_err(sheet="customers", row=row, field="birthday", msg="Định dạng YYYY-MM-DD"))

    # -------- locations --------
    for row in wb.get("locations", []):
        rid = _as_int(row.get("id"))
        code = (row.get("code") or "").strip() if row.get("code") else ""
        if rid is None and not code:
            errors.append(_err(sheet="locations", row=row, field="code", msg="Bắt buộc khi tạo mới"))

    # -------- parents --------
    for row in wb.get("product_parents", []):
        rid = _as_int(row.get("id"))
        name = (row.get("name") or "").strip() if row.get("name") else ""
        cat_id = _as_int(row.get("category_id"))
        if rid is None and not name:
            errors.append(_err(sheet="product_parents", row=row, field="name", msg="Bắt buộc khi tạo mới"))
        if cat_id is not None and cat_id not in existing_category_ids:
            errors.append(_err(sheet="product_parents", row=row, field="category_id", msg="Category không tồn tại"))

    # -------- variants --------
    for row in wb.get("product_variants", []):
        rid = _as_int(row.get("id"))
        name = (row.get("name") or "").strip() if row.get("name") else ""
        price = _as_decimal(row.get("price"))
        stock = _as_decimal(row.get("stock"))
        cat_id = _as_int(row.get("category_id"))
        parent_id = _as_int(row.get("parent_id"))

        if rid is None:
            if not name:
                errors.append(_err(sheet="product_variants", row=row, field="name", msg="Bắt buộc khi tạo mới"))
            if price is None:
                errors.append(_err(sheet="product_variants", row=row, field="price", msg="Bắt buộc khi tạo mới"))
            if stock is None:
                errors.append(_err(sheet="product_variants", row=row, field="stock", msg="Bắt buộc khi tạo mới"))
        if price is not None and price < 0:
            errors.append(_err(sheet="product_variants", row=row, field="price", msg="Phải >= 0"))
        if stock is not None and stock < 0:
            errors.append(_err(sheet="product_variants", row=row, field="stock", msg="Phải >= 0"))
        if cat_id is not None and cat_id not in existing_category_ids:
            # allow resolving by name if provided
            cat_name = (row.get("category_name") or "").strip()
            if not cat_name:
                errors.append(_err(sheet="product_variants", row=row, field="category_id", msg="Category không tồn tại"))
        if parent_id is not None and parent_id not in existing_parent_ids:
            # allow resolving by name if provided
            pn = (row.get("parent_name") or "").strip()
            if not pn:
                errors.append(_err(sheet="product_variants", row=row, field="parent_id", msg="Parent không tồn tại"))

        attrs = row.get("attrs_json")
        if attrs:
            try:
                parsed = json.loads(attrs)
                if parsed is not None and not isinstance(parsed, dict):
                    errors.append(_err(sheet="product_variants", row=row, field="attrs_json", msg="Phải là JSON object"))
            except Exception:
                errors.append(_err(sheet="product_variants", row=row, field="attrs_json", msg="JSON không hợp lệ"))

        b = row.get("track_stock_unit")
        if b and _as_bool(b) is None:
            errors.append(_err(sheet="product_variants", row=row, field="track_stock_unit", msg="Giá trị bool: 1/0, true/false, có/không"))

    # -------- stock units --------
    for row in wb.get("stock_units", []):
        rid = _as_int(row.get("id"))
        variant_id = _as_int(row.get("variant_id"))
        uom = (row.get("uom") or "").strip() if row.get("uom") else ""
        initial_qty = _as_decimal(row.get("initial_qty"))
        remaining_qty = _as_decimal(row.get("remaining_qty"))
        loc_id = _as_int(row.get("location_id"))
        if rid is None:
            if variant_id is None:
                errors.append(_err(sheet="stock_units", row=row, field="variant_id", msg="Bắt buộc khi tạo mới"))
            if not uom:
                errors.append(_err(sheet="stock_units", row=row, field="uom", msg="Bắt buộc khi tạo mới"))
            if initial_qty is None:
                errors.append(_err(sheet="stock_units", row=row, field="initial_qty", msg="Bắt buộc khi tạo mới"))
            if remaining_qty is None:
                errors.append(_err(sheet="stock_units", row=row, field="remaining_qty", msg="Bắt buộc khi tạo mới"))
        if variant_id is not None and variant_id not in existing_variant_ids:
            errors.append(_err(sheet="stock_units", row=row, field="variant_id", msg="Variant không tồn tại"))
        if loc_id is not None and loc_id not in existing_location_ids:
            errors.append(_err(sheet="stock_units", row=row, field="location_id", msg="Location không tồn tại"))
        if initial_qty is not None and initial_qty <= 0:
            errors.append(_err(sheet="stock_units", row=row, field="initial_qty", msg="Phải > 0"))
        if remaining_qty is not None and remaining_qty < 0:
            errors.append(_err(sheet="stock_units", row=row, field="remaining_qty", msg="Phải >= 0"))
        if rid is None and remaining_qty is not None and remaining_qty <= 0:
            errors.append(_err(sheet="stock_units", row=row, field="remaining_qty", msg="Tạo mới: phải > 0"))
        if rid is None and initial_qty is not None and remaining_qty is not None and initial_qty != remaining_qty:
            errors.append(_err(sheet="stock_units", row=row, field="remaining_qty", msg="Tạo mới: remaining_qty phải = initial_qty"))

    if errors:
        raise HTTPException(status_code=422, detail={"message": "File có lỗi. Vui lòng sửa và import lại.", "errors": errors})

    # ----------------- Apply in one transaction -----------------
    try:
        # categories
        for row in wb.get("categories", []):
            rid = _as_int(row.get("id"))
            data = {
                "name": (row.get("name") or "").strip() or None,
                "description": row.get("description"),
                "image_url": row.get("image_url"),
            }
            if rid is None:
                if not data["name"]:
                    continue
                db.add(Category(**data))  # type: ignore[arg-type]
                counts["created"] += 1
            else:
                obj = db.get(Category, rid)
                if obj is None:
                    continue
                for k, v in data.items():
                    if v is None or (isinstance(v, str) and v.strip() == ""):
                        continue
                    setattr(obj, k, v)
                counts["updated"] += 1

        # suppliers
        for row in wb.get("suppliers", []):
            rid = _as_int(row.get("id"))
            debt_val = _as_decimal(row.get("debt"))
            is_active_val = _as_bool(row.get("is_active"))
            data = {
                "code": (row.get("code") or "").strip() or None,
                "name": (row.get("name") or "").strip() or None,
                "phone": (row.get("phone") or "").strip() or None,
                "email": (row.get("email") or "").strip() or None,
                "address": row.get("address"),
                "contact_name": row.get("contact_name"),
                "tax_code": row.get("tax_code"),
                "bank_name": row.get("bank_name"),
                "bank_account": row.get("bank_account"),
                "bank_branch": row.get("bank_branch"),
                "debt": debt_val,
                "note": row.get("note"),
                "is_active": is_active_val,
            }
            if rid is None:
                if not data["name"]:
                    continue
                if data["debt"] is None:
                    data["debt"] = Decimal("0")
                if data["is_active"] is None:
                    data["is_active"] = True
                db.add(Supplier(**data))  # type: ignore[arg-type]
                counts["created"] += 1
            else:
                obj = db.get(Supplier, rid)
                if obj is None:
                    continue
                for k, v in data.items():
                    if v is None or (isinstance(v, str) and v.strip() == ""):
                        continue
                    setattr(obj, k, v)
                counts["updated"] += 1

        # customers
        for row in wb.get("customers", []):
            rid = _as_int(row.get("id"))
            points_val = _as_int(row.get("points"))
            debt_val = _as_decimal(row.get("debt"))
            is_active_val = _as_bool(row.get("is_active"))
            gender_raw = (row.get("gender") or "").strip().lower() if row.get("gender") else ""
            data = {
                "code": (row.get("code") or "").strip() or None,
                "name": (row.get("name") or "").strip() or None,
                "phone": (row.get("phone") or "").strip() or None,
                "email": (row.get("email") or "").strip() or None,
                "address": row.get("address"),
                "tax_code": row.get("tax_code"),
                "gender": gender_raw or None,
                "birthday": _as_date(row.get("birthday")),
                "points": points_val,
                "debt": debt_val,
                "note": row.get("note"),
                "is_active": is_active_val,
            }
            if rid is None:
                if not data["name"]:
                    continue
                if data["gender"] is None:
                    data["gender"] = "unknown"
                if data["points"] is None:
                    data["points"] = 0
                if data["debt"] is None:
                    data["debt"] = Decimal("0")
                if data["is_active"] is None:
                    data["is_active"] = True
                db.add(Customer(**data))  # type: ignore[arg-type]
                counts["created"] += 1
            else:
                obj = db.get(Customer, rid)
                if obj is None:
                    continue
                for k, v in data.items():
                    if v is None or (isinstance(v, str) and v.strip() == ""):
                        continue
                    setattr(obj, k, v)
                counts["updated"] += 1

        # locations
        for row in wb.get("locations", []):
            rid = _as_int(row.get("id"))
            data = {
                "code": (row.get("code") or "").strip() or None,
                "name": (row.get("name") or "").strip() or None,
                "note": row.get("note"),
            }
            if rid is None:
                if not data["code"]:
                    continue
                db.add(Location(**data))  # type: ignore[arg-type]
                counts["created"] += 1
            else:
                obj = db.get(Location, rid)
                if obj is None:
                    continue
                for k, v in data.items():
                    if v is None or (isinstance(v, str) and v.strip() == ""):
                        continue
                    setattr(obj, k, v)
                counts["updated"] += 1

        db.flush()

        # parents
        for row in wb.get("product_parents", []):
            rid = _as_int(row.get("id"))
            cat_id = _as_int(row.get("category_id"))
            is_active = _as_bool(row.get("is_active"))
            data = {
                "name": (row.get("name") or "").strip() or None,
                "category_id": cat_id,
                "description": row.get("description"),
                "image_url": row.get("image_url"),
                "is_active": is_active,
                # parent container conventions:
                "parent_id": None,
                "price": None,
            }
            if rid is None:
                if not data["name"]:
                    continue
                if data["is_active"] is None:
                    data["is_active"] = True
                db.add(Product(**data))  # type: ignore[arg-type]
                counts["created"] += 1
            else:
                obj = db.get(Product, rid)
                if obj is None or not is_parent_container(obj):
                    continue
                for k, v in data.items():
                    if k in {"parent_id", "price"}:
                        continue
                    if v is None or (isinstance(v, str) and v.strip() == ""):
                        continue
                    setattr(obj, k, v)
                counts["updated"] += 1

        db.flush()

        # variants
        for row in wb.get("product_variants", []):
            rid = _as_int(row.get("id"))
            parent_id = _as_int(row.get("parent_id"))
            if parent_id is None:
                pn = (row.get("parent_name") or "").strip()
                if pn:
                    p = _parent_by_name(pn)
                    parent_id = p.id if p else None

            cat_id = _as_int(row.get("category_id"))
            if cat_id is None:
                cn = (row.get("category_name") or "").strip()
                if cn:
                    c = _cat_by_name(cn)
                    cat_id = c.id if c else None

            attrs_json = row.get("attrs_json")
            attrs = None
            if attrs_json:
                attrs = json.loads(attrs_json)

            track_su = _as_bool(row.get("track_stock_unit"))
            is_active = _as_bool(row.get("is_active"))
            data = {
                "parent_id": parent_id,
                "category_id": cat_id,
                "name": (row.get("name") or "").strip() or None,
                "description": row.get("description"),
                "uom": (row.get("uom") or "").strip() or None,
                "price": _as_decimal(row.get("price")),
                "roll_price": _as_decimal(row.get("roll_price")),
                "cost_price": _as_decimal(row.get("cost_price")),
                "stock": _as_decimal(row.get("stock")),
                "sku": (row.get("sku") or "").strip() or None,
                "barcode": (row.get("barcode") or "").strip() or None,
                "image_url": row.get("image_url"),
                "attrs": attrs,
                "track_stock_unit": track_su,
                "is_active": is_active,
            }
            if rid is None:
                # create
                if not data["name"]:
                    continue
                if data["price"] is None or data["stock"] is None:
                    continue
                if data["track_stock_unit"] is None:
                    data["track_stock_unit"] = False
                if data["is_active"] is None:
                    data["is_active"] = True
                db.add(Product(**data))  # type: ignore[arg-type]
                counts["created"] += 1
            else:
                obj = db.get(Product, rid)
                if obj is None or not is_sellable_product(obj):
                    continue
                for k, v in data.items():
                    if v is None or (isinstance(v, str) and v.strip() == ""):
                        continue
                    setattr(obj, k, v)
                counts["updated"] += 1

        db.flush()

        # stock units
        for row in wb.get("stock_units", []):
            rid = _as_int(row.get("id"))
            variant_id = _as_int(row.get("variant_id"))
            uom = (row.get("uom") or "").strip() if row.get("uom") else None
            barcode = (row.get("barcode") or "").strip() if row.get("barcode") else None
            loc_id = _as_int(row.get("location_id"))
            initial_qty = _as_decimal(row.get("initial_qty"))
            remaining_qty = _as_decimal(row.get("remaining_qty"))
            cost_roll_price = _as_decimal(row.get("cost_roll_price"))
            cost_per_m = _as_decimal(row.get("cost_per_m"))

            if rid is None:
                if variant_id is None or uom is None or initial_qty is None or remaining_qty is None:
                    continue
                v = db.get(Product, variant_id)
                if v is None or not is_sellable_product(v) or not v.track_stock_unit:
                    continue
                if v.uom is not None and uom != v.uom:
                    raise HTTPException(422, f"Stock unit uom phải giống variant.uom (variant_id={variant_id})")

                if barcode is None:
                    prefix = (v.sku or f"VAR{v.id}").replace(" ", "").upper()
                    barcode = f"{prefix}-ROLL-{uuid4().hex[:10]}"

                old_stock = v.stock or Decimal("0")
                if v.stock is None:
                    v.stock = Decimal("0")
                # Keep variant.stock as sellable qty (e.g. meters)
                v.stock += remaining_qty
                if cost_per_m is not None:
                    v.cost_price = compute_moving_average_cost(
                        current_cost=v.cost_price,
                        current_qty=old_stock,
                        received_cost=cost_per_m,
                        received_qty=remaining_qty,
                    )

                su = StockUnit(
                    variant_id=variant_id,
                    barcode=barcode,
                    location_id=loc_id,
                    uom=uom,
                    initial_qty=initial_qty,
                    remaining_qty=remaining_qty,
                    cost_roll_price=cost_roll_price,
                    cost_per_m=cost_per_m,
                    is_depleted=remaining_qty <= 0,
                )
                db.add(su)
                counts["created"] += 1
            else:
                su = db.get(StockUnit, rid)
                if su is None:
                    continue
                # MVP: only allow patching remaining_qty/location_id/cost fields in import (safe)
                if loc_id is not None:
                    su.location_id = loc_id
                if remaining_qty is not None:
                    old_rem = su.remaining_qty or Decimal("0")
                    su.remaining_qty = remaining_qty
                    su.is_depleted = remaining_qty <= 0
                    v = db.get(Product, su.variant_id)
                    if v is not None and v.track_stock_unit:
                        if v.stock is None:
                            v.stock = Decimal("0")
                        v.stock += (remaining_qty - old_rem)
                if cost_roll_price is not None:
                    su.cost_roll_price = cost_roll_price
                if cost_per_m is not None:
                    su.cost_per_m = cost_per_m
                counts["updated"] += 1

        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(409, f"Lỗi trùng dữ liệu (unique). Chi tiết: {str(e.orig) if getattr(e, 'orig', None) else str(e)}")

    return {"ok": True, "counts": counts}
