"""add cash visibility password

Revision ID: d8e3f6a20b51
Revises: c7a2d5e91f40
Create Date: 2026-08-08 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d8e3f6a20b51"
down_revision: Union[str, Sequence[str], None] = "c7a2d5e91f40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cash_drawer_security",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("visibility_password_hash", sa.String(length=255), nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("cash_drawer_security")
