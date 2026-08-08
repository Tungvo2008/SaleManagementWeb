from __future__ import annotations

import os
import tempfile
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1.routes.cash_drawer import (
    set_visibility_password,
    verify_visibility_password,
    visibility_password_status,
)
from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.models.cash_drawer_security import CashDrawerSecurity
from app.models.user import User
from app.schemas.cash_drawer import (
    CashDrawerVisibilityPasswordIn,
    CashDrawerVisibilityPasswordVerifyIn,
)


class CashDrawerVisibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.engine = create_engine(
            f"sqlite:///{self.db_path}",
            connect_args={"check_same_thread": False},
            future=True,
        )
        self.SessionLocal = sessionmaker(bind=self.engine, future=True)
        Base.metadata.create_all(bind=self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def _db(self) -> Session:
        return self.SessionLocal()

    @staticmethod
    def _user(db: Session, username: str, role: str) -> User:
        user = User(
            username=username,
            password_hash=hash_password("login-password"),
            role=role,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def test_admin_sets_hashed_password_and_user_can_verify(self) -> None:
        db = self._db()
        try:
            admin = self._user(db, "admin-test", "admin")
            result = set_visibility_password(
                CashDrawerVisibilityPasswordIn(password="drawer-secret"),
                db=db,
                user=admin,
            )
            self.assertTrue(result.configured)

            stored = db.get(CashDrawerSecurity, 1)
            self.assertIsNotNone(stored)
            self.assertNotEqual(stored.visibility_password_hash, "drawer-secret")
            self.assertTrue(verify_password("drawer-secret", stored.visibility_password_hash))

            verified = verify_visibility_password(
                CashDrawerVisibilityPasswordVerifyIn(password="drawer-secret"),
                db=db,
            )
            self.assertTrue(verified.verified)
        finally:
            db.close()

    def test_non_admin_cannot_change_password(self) -> None:
        db = self._db()
        try:
            manager = self._user(db, "manager-test", "manager")
            with self.assertRaises(HTTPException) as ctx:
                set_visibility_password(
                    CashDrawerVisibilityPasswordIn(password="drawer-secret"),
                    db=db,
                    user=manager,
                )
            self.assertEqual(ctx.exception.status_code, 403)
            self.assertFalse(visibility_password_status(db=db).configured)
        finally:
            db.close()

    def test_wrong_or_unconfigured_password_is_rejected(self) -> None:
        db = self._db()
        try:
            with self.assertRaises(HTTPException) as missing_ctx:
                verify_visibility_password(
                    CashDrawerVisibilityPasswordVerifyIn(password="anything"),
                    db=db,
                )
            self.assertEqual(missing_ctx.exception.status_code, 409)

            admin = self._user(db, "admin-test-2", "admin")
            set_visibility_password(
                CashDrawerVisibilityPasswordIn(password="drawer-secret"),
                db=db,
                user=admin,
            )
            with self.assertRaises(HTTPException) as wrong_ctx:
                verify_visibility_password(
                    CashDrawerVisibilityPasswordVerifyIn(password="wrong"),
                    db=db,
                )
            self.assertEqual(wrong_ctx.exception.status_code, 403)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
