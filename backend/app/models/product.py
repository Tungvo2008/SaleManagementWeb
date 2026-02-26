from decimal import Decimal
from sqlalchemy import String, Text, ForeignKey, Integer, Numeric, Boolean, JSON, and_, or_
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
    # Use Decimal for money-like fields to avoid float rounding issues.
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    # For roll goods (e.g. mesh): optional special price when selling a full roll.
    roll_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    # Purchase/import price per sellable unit (uom). Parent rows keep this as NULL.
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(64),nullable=True)
    stock: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    # Barcode for normal goods (EAN/UPC/internal). Different from SKU.
    # For roll goods, barcodes live on StockUnit.barcode (per roll).
    barcode: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    attrs: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Keep a DB-level default too (matches migrations and prevents INSERT errors
    # from non-ORM paths).
    track_stock_unit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


def is_parent_container(p: Product | None) -> bool:
    """Parent container = holds variants, not directly sellable."""
    return p is not None and p.parent_id is None and p.price is None


def is_sellable_product(p: Product | None) -> bool:
    """Sellable product = classic child variant OR standalone SKU (no parent)."""
    return p is not None and (p.parent_id is not None or p.price is not None)


def parent_container_clause(ProductModel=Product):
    return and_(ProductModel.parent_id.is_(None), ProductModel.price.is_(None))


def sellable_product_clause(ProductModel=Product):
    return or_(ProductModel.parent_id.is_not(None), ProductModel.price.is_not(None))
