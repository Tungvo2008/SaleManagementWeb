from __future__ import annotations

import os
import tempfile
import unittest
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1.routes.pos_orders import (
    add_normal_item,
    cancel_draft,
    checkout,
    create_order,
)
from app.db.base import Base
from app.models.category import Category
from app.models.product import Product
from app.schemas.order import OrderCheckoutIn, OrderCreate
from app.schemas.order_item import OrderItemCreateNormal


class PosRulesTests(unittest.TestCase):
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

    def _create_normal_variant(self, db: Session, *, stock: Decimal = Decimal("10"), price: Decimal = Decimal("5.00")) -> Product:
        category = Category(name="Test Cat", description=None, image_url=None)
        db.add(category)
        db.flush()

        parent = Product(
            parent_id=None,
            category_id=category.id,
            name="Parent",
            description=None,
            image_url=None,
            price=None,
            stock=None,
            sku=None,
            barcode=None,
            attrs=None,
            track_stock_unit=False,
            is_active=True,
        )
        db.add(parent)
        db.flush()

        variant = Product(
            parent_id=parent.id,
            category_id=None,
            name="Variant",
            description=None,
            image_url=None,
            price=price,
            roll_price=None,
            uom="pcs",
            stock=stock,
            sku="V-001",
            barcode="BC-V-001",
            attrs=None,
            track_stock_unit=False,
            is_active=True,
        )
        db.add(variant)
        db.commit()
        db.refresh(variant)
        return variant

    def test_create_order_reuses_latest_empty_draft(self) -> None:
        db = self._db()
        try:
            o1 = create_order(OrderCreate(note=None), db=db)
            o2 = create_order(OrderCreate(note=None), db=db)
            self.assertEqual(o1.id, o2.id)
        finally:
            db.close()

    def test_create_order_creates_new_when_current_draft_has_items(self) -> None:
        db = self._db()
        try:
            variant = self._create_normal_variant(db)
            o1 = create_order(OrderCreate(note=None), db=db)
            add_normal_item(
                o1.id,
                OrderItemCreateNormal(variant_id=variant.id, qty=Decimal("1")),
                db=db,
            )
            o2 = create_order(OrderCreate(note=None), db=db)
            self.assertNotEqual(o1.id, o2.id)
        finally:
            db.close()

    def test_cancel_empty_draft_returns_409(self) -> None:
        db = self._db()
        try:
            o = create_order(OrderCreate(note=None), db=db)
            with self.assertRaises(HTTPException) as ctx:
                cancel_draft(o.id, db=db)
            self.assertEqual(ctx.exception.status_code, 409)
        finally:
            db.close()

    def test_cancel_non_empty_draft_sets_cancelled(self) -> None:
        db = self._db()
        try:
            variant = self._create_normal_variant(db)
            o = create_order(OrderCreate(note=None), db=db)
            add_normal_item(
                o.id,
                OrderItemCreateNormal(variant_id=variant.id, qty=Decimal("1")),
                db=db,
            )
            out = cancel_draft(o.id, db=db)
            self.assertEqual(out.status, "cancelled")
        finally:
            db.close()

    def test_checkout_empty_draft_returns_422(self) -> None:
        db = self._db()
        try:
            o = create_order(OrderCreate(note=None), db=db)
            with self.assertRaises(HTTPException) as ctx:
                checkout(
                    o.id,
                    OrderCheckoutIn(
                        payment_method="cash",
                        paid_amount=Decimal("0"),
                        note=None,
                    ),
                    db=db,
                )
            self.assertEqual(ctx.exception.status_code, 422)
        finally:
            db.close()

    def test_checkout_normal_item_deducts_stock(self) -> None:
        db = self._db()
        try:
            variant = self._create_normal_variant(db, stock=Decimal("5"), price=Decimal("10"))
            o = create_order(OrderCreate(note=None), db=db)
            add_normal_item(
                o.id,
                OrderItemCreateNormal(variant_id=variant.id, qty=Decimal("2")),
                db=db,
            )
            out = checkout(
                o.id,
                OrderCheckoutIn(
                    payment_method="cash",
                    paid_amount=Decimal("20"),
                    note=None,
                ),
                db=db,
            )
            updated_variant = db.get(Product, variant.id)
            self.assertEqual(out.status, "checked_out")
            self.assertIsNotNone(updated_variant)
            self.assertEqual(updated_variant.stock, Decimal("3"))
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()

