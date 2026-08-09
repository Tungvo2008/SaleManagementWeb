from __future__ import annotations

import os
import tempfile
import unittest
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.routes.products import create_standalone_variant
from app.db.base import Base
from app.schemas.product import VariantCreate
from app.services.sku import sku_from_name


class AutoSkuTests(unittest.TestCase):
    def setUp(self) -> None:
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.engine = create_engine(f"sqlite:///{self.db_path}", future=True)
        self.SessionLocal = sessionmaker(bind=self.engine, future=True)
        Base.metadata.create_all(bind=self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def _payload(self, name: str) -> VariantCreate:
        return VariantCreate(
            name=name,
            price=Decimal("10000"),
            uom="cái",
            stock=Decimal("0"),
            sku=None,
        )

    def test_sku_from_name_removes_vietnamese_marks_spaces_and_symbols(self) -> None:
        self.assertEqual(sku_from_name("Vại gạo - 30L"), "Vaigao30L")
        self.assertEqual(sku_from_name("Đèn LED 9W"), "DenLED9W")

    def test_blank_sku_is_generated_and_collision_gets_suffix(self) -> None:
        db = self.SessionLocal()
        try:
            first = create_standalone_variant(self._payload("Vại gạo - 30L"), db=db)
            second = create_standalone_variant(self._payload("Vại gạo - 30L"), db=db)
            self.assertEqual(first.sku, "Vaigao30L")
            self.assertEqual(second.sku, "Vaigao30L2")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
