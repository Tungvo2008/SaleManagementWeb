"""add order_item.refunded_qty

Revision ID: b6f2e2a7c9d3
Revises: 7e4d2f9c1b6a
Create Date: 2026-03-03 10:20:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b6f2e2a7c9d3"
down_revision: Union[str, Sequence[str], None] = "7e4d2f9c1b6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "order_items",
        sa.Column(
            "refunded_qty",
            sa.Numeric(12, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("order_items", "refunded_qty")

