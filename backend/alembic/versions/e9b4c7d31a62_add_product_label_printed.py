"""add product label printed marker

Revision ID: e9b4c7d31a62
Revises: d8e3f6a20b51
Create Date: 2026-08-11 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e9b4c7d31a62"
down_revision: Union[str, Sequence[str], None] = "d8e3f6a20b51"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("label_printed", sa.Boolean(), server_default=sa.text("0"), nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.drop_column("label_printed")
