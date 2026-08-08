from __future__ import annotations

from datetime import datetime

from app.db.session import SessionLocal
from app.models.product import Product, is_sellable_product
from app.models.stock_unit import StockUnit
from app.services.ean13 import DEFAULT_EAN13_PREFIX, generate_random_ean13


def _next_unique_barcode(used: set[str]) -> str:
    for _ in range(200):
        code = generate_random_ean13(prefix=DEFAULT_EAN13_PREFIX)
        if code not in used:
            used.add(code)
            return code
    raise RuntimeError("Không tạo được barcode EAN-13 duy nhất")


def main() -> None:
    with SessionLocal() as db:
      products = list(db.query(Product).order_by(Product.id.asc()).all())
      stock_units = list(db.query(StockUnit).order_by(StockUnit.id.asc()).all())

      used: set[str] = set()
      changed_products = 0
      changed_stock_units = 0

      for product in products:
          if not is_sellable_product(product):
              product.barcode = None
              continue
          product.barcode = _next_unique_barcode(used)
          changed_products += 1

      for stock_unit in stock_units:
          stock_unit.barcode = _next_unique_barcode(used)
          changed_stock_units += 1

      db.commit()
      print(
          {
              "migrated_at": datetime.now().isoformat(),
              "prefix": DEFAULT_EAN13_PREFIX,
              "products_changed": changed_products,
              "stock_units_changed": changed_stock_units,
              "total_used": len(used),
          }
      )


if __name__ == "__main__":
    main()
