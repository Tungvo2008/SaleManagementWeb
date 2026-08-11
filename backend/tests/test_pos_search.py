from __future__ import annotations

import os
import tempfile
import unittest
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.routes.pos_search import search
from app.db.base import Base
from app.models.category import Category
from app.models.product import Product


class PosSearchTests(unittest.TestCase):
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

    def test_search_matches_uppercase_variant_name_without_accents(self) -> None:
        db = self.SessionLocal()
        try:
            category = Category(name="Đồ nhà bếp")
            db.add(category)
            db.flush()
            parent = Product(
                name="CÀ MÈN GIỮ NHIỆT",
                category_id=category.id,
                price=None,
                stock=None,
                sku=None,
                is_active=True,
            )
            db.add(parent)
            db.flush()
            variant = Product(
                parent_id=parent.id,
                name="CÀ MÈN LOẠI 1.5 LÍT",
                price=Decimal("120000"),
                uom="cái",
                stock=Decimal("3"),
                sku="CAMEN15L",
                is_active=True,
            )
            db.add(variant)
            db.commit()

            result = search(q="ca men", limit=40, category_id=None, db=db)

            self.assertEqual([row.variant_id for row in result.variants], [variant.id])
            self.assertEqual(result.variants[0].parent_name, "CÀ MÈN GIỮ NHIỆT")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
