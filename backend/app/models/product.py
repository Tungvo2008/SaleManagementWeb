from sqlalchemy import String, Text, ForeignKey, Integer, Numeric, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class Product(Base):
    """
    Amazon-like:
      - parent: parent_id is NULL (group/variation container)
      - child:  parent_id points to parent (sellable variant)
    """
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    parent_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)
    parent = relationship("Product", remote_side="Product.id", back_populates="variants")
    variants = relationship("Product", back_populates="parent", cascade="all, delete-orphan")

    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    category = relationship("Category")

    # common fields
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # child-only fields (keep nullable for parent)
    price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sku: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    attrs: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
