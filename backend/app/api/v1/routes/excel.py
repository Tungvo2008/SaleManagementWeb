from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
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
from app.services.xlsxio import XlsxSheet, build_xlsx, parse_xlsx
from app.services.spreadsheetml import parse_workbook


router = APIRouter()

RESOURCE_SHEETS: dict[str, str] = {
    "categories": "categories",
    "suppliers": "suppliers",
    "customers": "customers",
    "locations": "locations",
    "products": "product_variants",
    "stock_units": "stock_units",
}


def _sheet_specs() -> dict[str, dict[str, Any]]:
    """
    Sheet specs for XLSX templates/exports.
    - keys: internal field keys used by importer
    - labels: Vietnamese column headers (row 1, visible)
    - required: keys to highlight as "bắt buộc"
    """
    return {
        "categories": {
            "keys": ["id", "name", "description", "image_url"],
            "labels": ["ID", "Tên danh mục", "Mô tả", "Ảnh (URL)"],
            "required": {"name"},
        },
        "suppliers": {
            "keys": [
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
            "labels": [
                "ID",
                "Mã NCC",
                "Tên NCC",
                "SĐT",
                "Email",
                "Địa chỉ",
                "Người liên hệ",
                "Mã số thuế",
                "Ngân hàng",
                "Số TK",
                "Chi nhánh",
                "Công nợ",
                "Ghi chú",
                "Active (1/0)",
            ],
            "required": {"name"},
        },
        "customers": {
            "keys": [
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
            "labels": [
                "ID",
                "Mã KH",
                "Tên KH",
                "SĐT",
                "Email",
                "Địa chỉ",
                "Mã số thuế",
                "Giới tính (unknown/male/female/other)",
                "Ngày sinh (YYYY-MM-DD)",
                "Điểm",
                "Công nợ",
                "Ghi chú",
                "Active (1/0)",
            ],
            "required": {"name"},
        },
        "locations": {
            "keys": ["id", "code", "name", "note"],
            "labels": ["ID", "Mã kệ", "Tên kệ", "Ghi chú"],
            "required": {"code"},
        },
        "product_parents": {
            "keys": ["id", "name", "category_id", "description", "image_url", "is_active"],
            "labels": ["ID", "Tên nhóm (Parent)", "Danh mục ID", "Mô tả", "Ảnh (URL)", "Active (1/0)"],
            "required": {"name"},
        },
        "product_variants": {
            "keys": [
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
            "labels": [
                "ID",
                "Parent ID",
                "Tên nhóm (Parent)",
                "Danh mục ID",
                "Tên danh mục",
                "Tên biến thể",
                "Mô tả",
                "Đơn vị",
                "Giá bán",
                "Giá cuộn",
                "Giá vốn/đv",
                "Tồn",
                "SKU",
                "Barcode",
                "Ảnh (URL)",
                "Thuộc tính (JSON)",
                "Theo cuộn (1/0)",
                "Active (1/0)",
            ],
            "required": {"name", "price", "stock"},
        },
        "stock_units": {
            "keys": [
                "id",
                # variant reference: prefer id, but can resolve by sku/barcode
                "variant_id",
                "variant_sku",
                "variant_barcode",
                "barcode",
                "location_id",
                "uom",
                "initial_qty",
                "remaining_qty",
                "cost_roll_price",
                "cost_per_m",
            ],
            "labels": [
                "ID",
                "Variant ID (hoặc SKU/Barcode)",
                "Variant SKU",
                "Variant Barcode",
                "Barcode cuộn",
                "Kệ ID",
                "Đơn vị",
                "Số lượng ban đầu",
                "Số lượng còn",
                "Giá nhập/cuộn",
                "Giá nhập/m",
            ],
            # Note: variant_id is preferred, but importer also supports variant_sku / variant_barcode.
            "required": {"variant_id", "uom", "initial_qty", "remaining_qty"},
        },
    }


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


XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _download_xlsx(filename: str, content: bytes) -> Response:
    return Response(
        content=content,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_spec_sheet(*, sheet_name: str, rows: list[dict[str, object | None]] | None = None) -> XlsxSheet:
    specs = _sheet_specs()
    spec = specs.get(sheet_name)
    if not spec:
        raise HTTPException(404, f"Không có sheet spec cho '{sheet_name}'")

    keys: list[str] = list(spec.get("keys") or [])
    labels: list[str] = list(spec.get("labels") or keys)
    required_keys: set[str] = set(spec.get("required") or set())

    # Add a "*" mark for required columns (user-friendly), but the importer
    # still reads internal keys from the hidden key row.
    pretty_labels: list[str] = []
    for i, k in enumerate(keys):
        base = labels[i] if i < len(labels) else k
        pretty_labels.append(f"{base} *" if k in required_keys else base)

    return XlsxSheet(
        name=sheet_name,
        keys=keys,
        labels=pretty_labels,
        required_keys=required_keys,
        rows=rows or [],
        include_key_row=True,
    )


def _guide_sheet() -> XlsxSheet:
    note = (
        "1) File này là .xlsx.\n"
        "2) Dòng 1 là tiêu đề tiếng Việt để dễ đọc.\n"
        "3) Dòng 2 (ẩn) là mã cột dùng để import. Vui lòng KHÔNG xoá/sửa dòng này.\n"
        "4) Cột bắt buộc được tô màu đỏ nhạt và có dấu *.\n"
        "5) Nếu có cột 'id': để trống = tạo mới; có id = cập nhật.\n"
        "   MVP: ô trống sẽ giữ nguyên dữ liệu cũ (không xoá dữ liệu).\n"
        "6) Với sheet 'stock_units': có thể dùng variant_id HOẶC variant_sku HOẶC variant_barcode.\n"
    )
    return XlsxSheet(
        name="Hướng_dẫn",
        labels=["Ghi chú"],
        rows=[{"Ghi chú": note}],
        include_key_row=False,
    )


@router.get("/template")
def download_template() -> Response:
    specs = _sheet_specs()
    # Keep a stable sheet order for templates.
    order = [
        "categories",
        "suppliers",
        "customers",
        "locations",
        "product_parents",
        "product_variants",
        "stock_units",
    ]
    sheets = [_guide_sheet()] + [_build_spec_sheet(sheet_name=s) for s in order if s in specs]
    content = build_xlsx(sheets=sheets)
    return _download_xlsx("mau-nhap-du-lieu.xlsx", content)


@router.get("/template/{resource}")
def download_single_template(resource: str) -> Response:
    """
    Template theo đúng trang (1 sheet).
    resource: categories | suppliers | customers | locations | products | stock_units
    """
    sheet_name = RESOURCE_SHEETS.get(resource)
    if not sheet_name:
        raise HTTPException(404, "Không hỗ trợ resource này")

    content = build_xlsx(sheets=[_guide_sheet(), _build_spec_sheet(sheet_name=sheet_name)])
    return _download_xlsx(f"mau-{resource}.xlsx", content)


@router.get("/export/categories")
def export_categories(db: Session = Depends(get_db)) -> Response:
    cats = list(db.scalars(select(Category).order_by(Category.id.asc())).all())
    rows = [{"id": c.id, "name": c.name, "description": c.description, "image_url": c.image_url} for c in cats]
    content = build_xlsx(sheets=[_build_spec_sheet(sheet_name="categories", rows=rows)])
    return _download_xlsx("categories.xlsx", content)


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
    content = build_xlsx(sheets=[_build_spec_sheet(sheet_name="suppliers", rows=rows)])
    return _download_xlsx("suppliers.xlsx", content)


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
    content = build_xlsx(sheets=[_build_spec_sheet(sheet_name="customers", rows=rows)])
    return _download_xlsx("customers.xlsx", content)


@router.get("/export/locations")
def export_locations(db: Session = Depends(get_db)) -> Response:
    rows = [{"id": it.id, "code": it.code, "name": it.name, "note": it.note} for it in db.scalars(select(Location)).all()]
    content = build_xlsx(sheets=[_build_spec_sheet(sheet_name="locations", rows=rows)])
    return _download_xlsx("locations.xlsx", content)


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
    content = build_xlsx(sheets=[_build_spec_sheet(sheet_name="product_variants", rows=rows)])
    return _download_xlsx("products.xlsx", content)


@router.get("/export/stock_units")
def export_stock_units(variant_id: int | None = None, location_id: int | None = None, db: Session = Depends(get_db)) -> Response:
    s = select(StockUnit).order_by(StockUnit.id.desc())
    if variant_id is not None:
        s = s.where(StockUnit.variant_id == variant_id)
    if location_id is not None:
        s = s.where(StockUnit.location_id == location_id)
    variant_by_id = {p.id: p for p in db.scalars(select(Product).where(sellable_product_clause(Product))).all()}
    rows = []
    for it in db.scalars(s).all():
        v = variant_by_id.get(it.variant_id)
        rows.append(
            {
                "id": it.id,
                "variant_id": it.variant_id,
                "variant_sku": v.sku if v else None,
                "variant_barcode": v.barcode if v else None,
                "barcode": it.barcode,
                "location_id": it.location_id,
                "uom": it.uom,
                "initial_qty": it.initial_qty,
                "remaining_qty": it.remaining_qty,
                "cost_roll_price": it.cost_roll_price,
                "cost_per_m": it.cost_per_m,
            }
        )
    content = build_xlsx(sheets=[_build_spec_sheet(sheet_name="stock_units", rows=rows)])
    return _download_xlsx("stock_units.xlsx", content)


class ExportViewPayload(BaseModel):
    filename: str | None = None
    sheet_name: str = Field("data", max_length=64)
    columns: list[str]
    required: list[str] = []
    rows: list[dict[str, Any]]


@router.post("/export/view")
def export_view(payload: ExportViewPayload) -> Response:
    cols = [c for c in payload.columns if isinstance(c, str) and c.strip()]
    if not cols:
        raise HTTPException(422, "columns rỗng")
    required = set(payload.required or [])
    rows = payload.rows or []
    sheet = XlsxSheet(
        name=payload.sheet_name or "data",
        keys=cols,
        labels=cols,
        required_keys=required,
        rows=rows,  # keys are already column titles
        include_key_row=False,
    )
    content = build_xlsx(sheets=[sheet])
    fn = payload.filename or "export.xlsx"
    if not fn.lower().endswith(".xlsx"):
        fn = f"{fn}.xlsx"
    return _download_xlsx(fn, content)


def _pick_only_sheet(wb: dict[str, list[dict[str, str | None]]], *, sheet_name: str) -> dict[str, list[dict[str, str | None]]]:
    if sheet_name in wb:
        return {sheet_name: wb.get(sheet_name, [])}

    # Fallback: if user uploaded a 1-sheet file, accept it even if the sheet name differs.
    other = [k for k in wb.keys() if k.strip().lower() not in {"hướng_dẫn", "huong_dan", "guide", "instructions"}]
    if len(other) == 1:
        return {sheet_name: wb.get(other[0], [])}

    raise HTTPException(422, f"Không tìm thấy sheet '{sheet_name}' trong file.")


def _norm_key(v: str) -> str:
    return str(v).strip().lower()


def _check_dupes_in_file(
    *,
    errors: list[dict[str, Any]],
    sheet: str,
    rows: list[dict[str, str | None]],
    field: str,
    label: str | None = None,
) -> None:
    seen: dict[str, int] = {}
    for row in rows:
        raw = row.get(field)
        if not raw:
            continue
        k = _norm_key(raw)
        if not k:
            continue
        if k in seen:
            errors.append(
                _err(
                    sheet=sheet,
                    row=row,
                    field=field,
                    msg=f"Trùng {label or field} trong file (đã có ở dòng {seen[k]})",
                )
            )
        else:
            seen[k] = int(row.get("__rownum__", "0") or 0)


async def _import_workbook_impl(*, wb: dict[str, list[dict[str, str | None]]], db: Session, dry_run: bool) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    counts: dict[str, int] = {"created": 0, "updated": 0}

    # ----------------- Helpers: FK lookup -----------------
    def _cat_by_name(name: str) -> Category | None:
        return db.scalars(select(Category).where(Category.name == name).limit(1)).first()

    def _parent_by_name(name: str) -> Product | None:
        q = select(Product).where(parent_container_clause(Product), Product.name == name).limit(1)
        return db.scalars(q).first()

    # ----------------- Preload for validation -----------------
    existing_category_ids = set(db.scalars(select(Category.id)).all())
    existing_location_ids = set(db.scalars(select(Location.id)).all())
    existing_variant_ids = set(db.scalars(select(Product.id).where(sellable_product_clause(Product))).all())
    existing_parent_ids = set(db.scalars(select(Product.id).where(parent_container_clause(Product))).all())

    # Maps for variant resolution by sku/barcode (for stock_units import)
    sku_to_variant_id: dict[str, int] = {}
    barcode_to_variant_id: dict[str, int] = {}
    for pid, sku, bc in db.execute(
        select(Product.id, Product.sku, Product.barcode).where(sellable_product_clause(Product))
    ).all():
        if sku:
            sku_to_variant_id[_norm_key(sku)] = pid
        if bc:
            barcode_to_variant_id[_norm_key(bc)] = pid

    variant_meta: dict[int, tuple[bool, str | None]] = {}
    for pid, track_su, uom in db.execute(
        select(Product.id, Product.track_stock_unit, Product.uom).where(sellable_product_clause(Product))
    ).all():
        variant_meta[pid] = (bool(track_su), uom)

    # ----------------- Duplicate checks inside file -----------------
    _check_dupes_in_file(errors=errors, sheet="categories", rows=wb.get("categories", []), field="name", label="tên danh mục")
    _check_dupes_in_file(errors=errors, sheet="suppliers", rows=wb.get("suppliers", []), field="code", label="mã NCC")
    _check_dupes_in_file(errors=errors, sheet="customers", rows=wb.get("customers", []), field="code", label="mã KH")
    _check_dupes_in_file(errors=errors, sheet="customers", rows=wb.get("customers", []), field="phone", label="SĐT")
    _check_dupes_in_file(errors=errors, sheet="locations", rows=wb.get("locations", []), field="code", label="mã kệ")
    _check_dupes_in_file(errors=errors, sheet="product_variants", rows=wb.get("product_variants", []), field="sku", label="SKU")
    _check_dupes_in_file(errors=errors, sheet="product_variants", rows=wb.get("product_variants", []), field="barcode", label="barcode")
    _check_dupes_in_file(errors=errors, sheet="stock_units", rows=wb.get("stock_units", []), field="barcode", label="barcode cuộn")

    # ----------------- DB uniqueness checks (per-row error) -----------------
    # categories.name
    cat_names = {_norm_key(r.get("name") or "") for r in wb.get("categories", []) if r.get("name")}
    cat_names.discard("")
    existing_cat_by_name: dict[str, int] = {}
    if cat_names:
        for cid, nm in db.execute(select(Category.id, Category.name).where(Category.name.in_(list(cat_names)))).all():
            existing_cat_by_name[_norm_key(nm)] = cid

    # suppliers.code
    sup_codes = {_norm_key(r.get("code") or "") for r in wb.get("suppliers", []) if r.get("code")}
    sup_codes.discard("")
    existing_sup_by_code: dict[str, int] = {}
    if sup_codes:
        for sid, cd in db.execute(select(Supplier.id, Supplier.code).where(Supplier.code.in_(list(sup_codes)))).all():
            if cd:
                existing_sup_by_code[_norm_key(cd)] = sid

    # customers.code + customers.phone
    cus_codes = {_norm_key(r.get("code") or "") for r in wb.get("customers", []) if r.get("code")}
    cus_codes.discard("")
    cus_phones = {_norm_key(r.get("phone") or "") for r in wb.get("customers", []) if r.get("phone")}
    cus_phones.discard("")
    existing_cus_by_code: dict[str, int] = {}
    existing_cus_by_phone: dict[str, int] = {}
    if cus_codes:
        for cid, cd in db.execute(select(Customer.id, Customer.code).where(Customer.code.in_(list(cus_codes)))).all():
            if cd:
                existing_cus_by_code[_norm_key(cd)] = cid
    if cus_phones:
        for cid, ph in db.execute(select(Customer.id, Customer.phone).where(Customer.phone.in_(list(cus_phones)))).all():
            if ph:
                existing_cus_by_phone[_norm_key(ph)] = cid

    # locations.code
    loc_codes = {_norm_key(r.get("code") or "") for r in wb.get("locations", []) if r.get("code")}
    loc_codes.discard("")
    existing_loc_by_code: dict[str, int] = {}
    if loc_codes:
        for lid, cd in db.execute(select(Location.id, Location.code).where(Location.code.in_(list(loc_codes)))).all():
            existing_loc_by_code[_norm_key(cd)] = lid

    # products.sku + products.barcode
    prod_skus = {_norm_key(r.get("sku") or "") for r in wb.get("product_variants", []) if r.get("sku")}
    prod_skus.discard("")
    prod_bcs = {_norm_key(r.get("barcode") or "") for r in wb.get("product_variants", []) if r.get("barcode")}
    prod_bcs.discard("")
    existing_prod_by_sku: dict[str, int] = {}
    existing_prod_by_bc: dict[str, int] = {}
    if prod_skus:
        for pid, sku in db.execute(select(Product.id, Product.sku).where(Product.sku.in_(list(prod_skus)))).all():
            if sku:
                existing_prod_by_sku[_norm_key(sku)] = pid
    if prod_bcs:
        for pid, bc in db.execute(select(Product.id, Product.barcode).where(Product.barcode.in_(list(prod_bcs)))).all():
            if bc:
                existing_prod_by_bc[_norm_key(bc)] = pid

    # stock_units.barcode
    su_bcs = {_norm_key(r.get("barcode") or "") for r in wb.get("stock_units", []) if r.get("barcode")}
    su_bcs.discard("")
    existing_su_by_bc: dict[str, int] = {}
    if su_bcs:
        for sid, bc in db.execute(select(StockUnit.id, StockUnit.barcode).where(StockUnit.barcode.in_(list(su_bcs)))).all():
            if bc:
                existing_su_by_bc[_norm_key(bc)] = sid

    # ----------------- Validate -----------------
    # categories
    for row in wb.get("categories", []):
        rid = _as_int(row.get("id"))
        name = (row.get("name") or "").strip() if row.get("name") else ""
        if rid is None and not name:
            errors.append(_err(sheet="categories", row=row, field="name", msg="Bắt buộc khi tạo mới"))
        if name and len(name) > 200:
            errors.append(_err(sheet="categories", row=row, field="name", msg="Tối đa 200 ký tự"))
        if name:
            existed_id = existing_cat_by_name.get(_norm_key(name))
            if existed_id is not None and (rid is None or existed_id != rid):
                errors.append(_err(sheet="categories", row=row, field="name", msg=f"Trùng tên danh mục trong DB (ID {existed_id})"))

    # suppliers
    for row in wb.get("suppliers", []):
        rid = _as_int(row.get("id"))
        name = (row.get("name") or "").strip() if row.get("name") else ""
        code = (row.get("code") or "").strip() if row.get("code") else ""
        if rid is None and not name:
            errors.append(_err(sheet="suppliers", row=row, field="name", msg="Bắt buộc khi tạo mới"))
        if code:
            existed_id = existing_sup_by_code.get(_norm_key(code))
            if existed_id is not None and (rid is None or existed_id != rid):
                errors.append(_err(sheet="suppliers", row=row, field="code", msg=f"Trùng mã NCC trong DB (ID {existed_id})"))

    # customers
    for row in wb.get("customers", []):
        rid = _as_int(row.get("id"))
        name = (row.get("name") or "").strip() if row.get("name") else ""
        code = (row.get("code") or "").strip() if row.get("code") else ""
        phone = (row.get("phone") or "").strip() if row.get("phone") else ""
        if rid is None and not name:
            errors.append(_err(sheet="customers", row=row, field="name", msg="Bắt buộc khi tạo mới"))
        g = row.get("gender")
        if g and str(g).strip().lower() not in {"unknown", "male", "female", "other"}:
            errors.append(_err(sheet="customers", row=row, field="gender", msg="Giá trị hợp lệ: unknown/male/female/other"))
        if row.get("birthday") and _as_date(row.get("birthday")) is None:
            errors.append(_err(sheet="customers", row=row, field="birthday", msg="Định dạng YYYY-MM-DD"))
        if code:
            existed_id = existing_cus_by_code.get(_norm_key(code))
            if existed_id is not None and (rid is None or existed_id != rid):
                errors.append(_err(sheet="customers", row=row, field="code", msg=f"Trùng mã KH trong DB (ID {existed_id})"))
        if phone:
            existed_id = existing_cus_by_phone.get(_norm_key(phone))
            if existed_id is not None and (rid is None or existed_id != rid):
                errors.append(_err(sheet="customers", row=row, field="phone", msg=f"Trùng SĐT trong DB (ID {existed_id})"))

    # locations
    for row in wb.get("locations", []):
        rid = _as_int(row.get("id"))
        code = (row.get("code") or "").strip() if row.get("code") else ""
        if rid is None and not code:
            errors.append(_err(sheet="locations", row=row, field="code", msg="Bắt buộc khi tạo mới"))
        if code:
            existed_id = existing_loc_by_code.get(_norm_key(code))
            if existed_id is not None and (rid is None or existed_id != rid):
                errors.append(_err(sheet="locations", row=row, field="code", msg=f"Trùng mã kệ trong DB (ID {existed_id})"))

    # parents
    for row in wb.get("product_parents", []):
        rid = _as_int(row.get("id"))
        name = (row.get("name") or "").strip() if row.get("name") else ""
        cat_id = _as_int(row.get("category_id"))
        if rid is None and not name:
            errors.append(_err(sheet="product_parents", row=row, field="name", msg="Bắt buộc khi tạo mới"))
        if cat_id is not None and cat_id not in existing_category_ids:
            errors.append(_err(sheet="product_parents", row=row, field="category_id", msg="Category không tồn tại"))

    # variants
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
            cat_name = (row.get("category_name") or "").strip()
            if not cat_name:
                errors.append(_err(sheet="product_variants", row=row, field="category_id", msg="Category không tồn tại"))
        if parent_id is not None and parent_id not in existing_parent_ids:
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

        sku = (row.get("sku") or "").strip() if row.get("sku") else ""
        if sku:
            existed_id = existing_prod_by_sku.get(_norm_key(sku))
            if existed_id is not None and (rid is None or existed_id != rid):
                errors.append(_err(sheet="product_variants", row=row, field="sku", msg=f"Trùng SKU trong DB (ID {existed_id})"))
        bc = (row.get("barcode") or "").strip() if row.get("barcode") else ""
        if bc:
            existed_id = existing_prod_by_bc.get(_norm_key(bc))
            if existed_id is not None and (rid is None or existed_id != rid):
                errors.append(_err(sheet="product_variants", row=row, field="barcode", msg=f"Trùng barcode trong DB (ID {existed_id})"))

    # stock units
    for row in wb.get("stock_units", []):
        rid = _as_int(row.get("id"))
        variant_id = _as_int(row.get("variant_id"))
        variant_sku = (row.get("variant_sku") or "").strip() if row.get("variant_sku") else ""
        variant_barcode = (row.get("variant_barcode") or "").strip() if row.get("variant_barcode") else ""
        uom = (row.get("uom") or "").strip() if row.get("uom") else ""
        initial_qty = _as_decimal(row.get("initial_qty"))
        remaining_qty = _as_decimal(row.get("remaining_qty"))
        loc_id = _as_int(row.get("location_id"))
        bc = (row.get("barcode") or "").strip() if row.get("barcode") else ""

        if rid is None:
            # required
            if not uom:
                errors.append(_err(sheet="stock_units", row=row, field="uom", msg="Bắt buộc khi tạo mới"))
            if initial_qty is None:
                errors.append(_err(sheet="stock_units", row=row, field="initial_qty", msg="Bắt buộc khi tạo mới"))
            if remaining_qty is None:
                errors.append(_err(sheet="stock_units", row=row, field="remaining_qty", msg="Bắt buộc khi tạo mới"))
            if variant_id is None and not variant_sku and not variant_barcode:
                errors.append(_err(sheet="stock_units", row=row, field="variant_id", msg="Cần variant_id hoặc variant_sku hoặc variant_barcode"))

        # resolve variant id by sku/barcode if needed (validation only)
        resolved = variant_id
        if resolved is None and variant_sku:
            resolved = sku_to_variant_id.get(_norm_key(variant_sku))
            if resolved is None:
                errors.append(_err(sheet="stock_units", row=row, field="variant_sku", msg="Không tìm thấy variant theo SKU"))
        if resolved is None and variant_barcode:
            resolved = barcode_to_variant_id.get(_norm_key(variant_barcode))
            if resolved is None:
                errors.append(_err(sheet="stock_units", row=row, field="variant_barcode", msg="Không tìm thấy variant theo barcode"))

        if resolved is not None and resolved not in existing_variant_ids:
            errors.append(_err(sheet="stock_units", row=row, field="variant_id", msg="Variant không tồn tại"))
        if resolved is not None:
            meta = variant_meta.get(resolved)
            if meta:
                track, vuom = meta
                if not track:
                    errors.append(_err(sheet="stock_units", row=row, field="variant_id", msg="Variant này không theo cuộn (track_stock_unit=false)"))
                if vuom and uom and vuom != uom:
                    errors.append(_err(sheet="stock_units", row=row, field="uom", msg=f"uom phải giống variant.uom ({vuom})"))
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
        if bc:
            existed_id = existing_su_by_bc.get(_norm_key(bc))
            if existed_id is not None and (rid is None or existed_id != rid):
                errors.append(_err(sheet="stock_units", row=row, field="barcode", msg=f"Trùng barcode cuộn trong DB (ID {existed_id})"))

    if errors:
        raise HTTPException(status_code=422, detail={"message": "File có lỗi. Vui lòng sửa và import lại.", "errors": errors})

    # ----------------- Apply -----------------
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
            if variant_id is None:
                sku = (row.get("variant_sku") or "").strip() if row.get("variant_sku") else ""
                bc = (row.get("variant_barcode") or "").strip() if row.get("variant_barcode") else ""
                if sku:
                    variant_id = sku_to_variant_id.get(_norm_key(sku))
                if variant_id is None and bc:
                    variant_id = barcode_to_variant_id.get(_norm_key(bc))

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

        db.flush()
        if dry_run:
            db.rollback()
            return {"ok": True, "dry_run": True, "counts": counts}
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(409, f"Lỗi trùng dữ liệu (unique). Chi tiết: {str(e.orig) if getattr(e, 'orig', None) else str(e)}")

    return {"ok": True, "dry_run": False, "counts": counts}


def _parse_excel_any(raw: bytes) -> dict[str, list[dict[str, str | None]]]:
    """
    Parse either:
    - .xlsx (Office Open XML, zip -> starts with 'PK')
    - legacy SpreadsheetML (.xls XML Spreadsheet 2003)
    """
    if raw.startswith(b"PK"):
        return parse_xlsx(raw)
    return parse_workbook(raw)


@router.post("/import")
async def import_workbook(dry_run: bool = False, file: UploadFile = File(...), db: Session = Depends(get_db)):
    raw = await file.read()
    if not raw:
        raise HTTPException(422, "File rỗng")

    try:
        wb = _parse_excel_any(raw)
    except Exception:
        raise HTTPException(
            422,
            "Không đọc được file. Hãy dùng .xlsx (khuyến nghị) hoặc XML Spreadsheet 2003 (SpreadsheetML).",
        )
    return await _import_workbook_impl(wb=wb, db=db, dry_run=dry_run)


@router.post("/import/{resource}")
async def import_workbook_resource(resource: str, dry_run: bool = False, file: UploadFile = File(...), db: Session = Depends(get_db)):
    sheet_name = RESOURCE_SHEETS.get(resource)
    if not sheet_name:
        raise HTTPException(404, "Không hỗ trợ resource này")

    raw = await file.read()
    if not raw:
        raise HTTPException(422, "File rỗng")

    try:
        wb_full = _parse_excel_any(raw)
    except Exception:
        raise HTTPException(
            422,
            "Không đọc được file. Hãy dùng .xlsx (khuyến nghị) hoặc XML Spreadsheet 2003 (SpreadsheetML).",
        )

    wb = _pick_only_sheet(wb_full, sheet_name=sheet_name)
    return await _import_workbook_impl(wb=wb, db=db, dry_run=dry_run)
