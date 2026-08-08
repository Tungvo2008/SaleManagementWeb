"""allow standalone cash drawer entries

Revision ID: c7a2d5e91f40
Revises: f9c4b7e21a10
Create Date: 2026-08-08 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c7a2d5e91f40"
down_revision: Union[str, Sequence[str], None] = "f9c4b7e21a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("cash_drawer_entries", schema=None) as batch_op:
        batch_op.alter_column("session_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM cash_drawer_entries WHERE session_id IS NULL"))
    with op.batch_alter_table("cash_drawer_entries", schema=None) as batch_op:
        batch_op.alter_column("session_id", existing_type=sa.Integer(), nullable=False)
