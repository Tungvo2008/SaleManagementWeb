"""add price history table

Revision ID: f3a6c1b9e7aa
Revises: d2b1a8b1d001
Create Date: 2026-02-25 16:35:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a6c1b9e7aa"
down_revision: Union[str, Sequence[str], None] = "d2b1a8b1d001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "price_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Integer(), nullable=False),
        sa.Column("stock_unit_id", sa.Integer(), nullable=True),
        sa.Column("field", sa.String(length=32), nullable=False),
        sa.Column("old_value", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("new_value", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["stock_unit_id"], ["stock_units.id"]),
        sa.ForeignKeyConstraint(["variant_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_price_history_created_at"), "price_history", ["created_at"], unique=False)
    op.create_index(op.f("ix_price_history_field"), "price_history", ["field"], unique=False)
    op.create_index(op.f("ix_price_history_source"), "price_history", ["source"], unique=False)
    op.create_index(op.f("ix_price_history_stock_unit_id"), "price_history", ["stock_unit_id"], unique=False)
    op.create_index(op.f("ix_price_history_variant_id"), "price_history", ["variant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_price_history_variant_id"), table_name="price_history")
    op.drop_index(op.f("ix_price_history_stock_unit_id"), table_name="price_history")
    op.drop_index(op.f("ix_price_history_source"), table_name="price_history")
    op.drop_index(op.f("ix_price_history_field"), table_name="price_history")
    op.drop_index(op.f("ix_price_history_created_at"), table_name="price_history")
    op.drop_table("price_history")
