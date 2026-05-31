"""allow manual POS order items

Revision ID: f9c4b7e21a10
Revises: e1c4f2d9a901
Create Date: 2026-05-30 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f9c4b7e21a10"
down_revision: Union[str, Sequence[str], None] = "e1c4f2d9a901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("order_items", schema=None) as batch_op:
        batch_op.alter_column("variant_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM order_items
            WHERE variant_id IS NULL
            """
        )
    )
    with op.batch_alter_table("order_items", schema=None) as batch_op:
        batch_op.alter_column("variant_id", existing_type=sa.Integer(), nullable=False)
