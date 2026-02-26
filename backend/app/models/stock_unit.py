from decimal import Decimal
from sqlalchemy import String, Boolean, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class StockUnit(Base):
    __tablename__ = "stock_units"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True, nullable=False)
    barcode: Mapped[str] = mapped_column(String(200), nullable=True, unique=True, index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=True)
    uom: Mapped[str] = mapped_column(String(200), nullable=False)
    initial_qty: Mapped[Decimal] = mapped_column(Numeric(12,2))
    remaining_qty: Mapped[Decimal] = mapped_column(Numeric(12,2))
    # Purchase prices captured per roll receipt.
    cost_roll_price: Mapped[Decimal | None] = mapped_column(Numeric(12,2), nullable=True)
    cost_per_m: Mapped[Decimal | None] = mapped_column(Numeric(12,4), nullable=True)
    is_depleted: Mapped[bool] = mapped_column(Boolean, default=False)
    
