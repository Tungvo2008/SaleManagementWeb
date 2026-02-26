from __future__ import annotations

import os
import tempfile
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1.routes.categories import create_category, delete_category
from app.api.v1.routes.products import create_parent, create_variant, update_parent
from app.db.base import Base
from app.models.category import Category
from app.models.product import Product
from app.schemas.category import CategoryCreate
from app.schemas.product import ParentCreate, ParentUpdate, VariantCreate


class CrudValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)

        self.engine = create_engine(
            f"sqlite:///{self.db_path}",
            connect_args={"check_same_thread": False},
            future=True,
        )
        self.SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=self.engine,
            future=True,
        )
        Base.metadata.create_all(bind=self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def _db(self) -> Session:
        return self.SessionLocal()

    def test_create_category_duplicate_name_returns_409(self) -> None:
        db = self._db()
        try:
            create_category(CategoryCreate(name="Mugs", description=None, image_url=None), db=db)

            with self.assertRaises(HTTPException) as ctx:
                create_category(CategoryCreate(name="Mugs", description=None, image_url=None), db=db)

            self.assertEqual(ctx.exception.status_code, 409)
        finally:
            db.close()

    def test_delete_category_in_use_returns_409(self) -> None:
        db = self._db()
        try:
            category = Category(name="T-Shirts", description=None, image_url=None)
            db.add(category)
            db.flush()

            parent = Product(
                parent_id=None,
                category_id=category.id,
                name="Classic Tee",
                description=None,
                image_url=None,
                price=None,
                stock=None,
                sku=None,
                attrs=None,
                is_active=True,
            )
            db.add(parent)
            db.commit()

            with self.assertRaises(HTTPException) as ctx:
                delete_category(category.id, db=db)

            self.assertEqual(ctx.exception.status_code, 409)
        finally:
            db.close()

    def test_create_parent_with_missing_category_returns_404(self) -> None:
        db = self._db()
        try:
            with self.assertRaises(HTTPException) as ctx:
                create_parent(
                    ParentCreate(
                        name="New Parent",
                        description=None,
                        image_url=None,
                        category_id=9999,
                    ),
                    db=db,
                )

            self.assertEqual(ctx.exception.status_code, 404)
        finally:
            db.close()

    def test_update_parent_with_missing_category_returns_404(self) -> None:
        db = self._db()
        try:
            category = Category(name="Mugs", description=None, image_url=None)
            db.add(category)
            db.flush()

            parent = Product(
                parent_id=None,
                category_id=category.id,
                name="Ceramic Mug",
                description=None,
                image_url=None,
                price=None,
                stock=None,
                sku=None,
                attrs=None,
                is_active=True,
            )
            db.add(parent)
            db.commit()

            with self.assertRaises(HTTPException) as ctx:
                update_parent(
                    parent.id,
                    ParentUpdate(category_id=9999),
                    db=db,
                )

            self.assertEqual(ctx.exception.status_code, 404)
        finally:
            db.close()

    def test_create_variant_duplicate_sku_returns_409(self) -> None:
        db = self._db()
        try:
            category = Category(name="Accessories", description=None, image_url=None)
            db.add(category)
            db.flush()

            parent = Product(
                parent_id=None,
                category_id=category.id,
                name="Bottle",
                description=None,
                image_url=None,
                price=None,
                stock=None,
                sku=None,
                attrs=None,
                is_active=True,
            )
            db.add(parent)
            db.flush()

            existing_variant = Product(
                parent_id=parent.id,
                category_id=None,
                name="Bottle - Blue",
                description=None,
                image_url=None,
                price=10.00,
                stock=3,
                sku="BOTTLE-BLUE",
                attrs={"color": "blue"},
                is_active=True,
            )
            db.add(existing_variant)
            db.commit()

            with self.assertRaises(HTTPException) as ctx:
                create_variant(
                    parent.id,
                    VariantCreate(
                        name="Bottle - Red",
                        price=11.00,
                        stock=5,
                        sku="BOTTLE-BLUE",
                        image_url=None,
                        attrs={"color": "red"},
                        is_active=True,
                    ),
                    db=db,
                )

            self.assertEqual(ctx.exception.status_code, 409)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
