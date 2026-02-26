from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Login identifier. Keep simple for MVP (no email flow yet).
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    # Store a password hash (bcrypt/argon2), never the raw password.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # MVP roles (we'll enforce via dependencies): "admin" | "cashier"
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default="cashier")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1")

    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, server_default=func.now())

