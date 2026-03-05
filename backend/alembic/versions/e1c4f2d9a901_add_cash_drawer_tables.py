"""add cash drawer tables

Revision ID: e1c4f2d9a901
Revises: b6f2e2a7c9d3
Create Date: 2026-03-04 23:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1c4f2d9a901"
down_revision: Union[str, Sequence[str], None] = "b6f2e2a7c9d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cash_drawer_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'open'"), nullable=False),
        sa.Column("opening_cash", sa.Numeric(12, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("expected_cash", sa.Numeric(12, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("counted_cash", sa.Numeric(12, 2), nullable=True),
        sa.Column("variance", sa.Numeric(12, 2), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("opened_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("opened_by_user_id", sa.Integer(), nullable=False),
        sa.Column("closed_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["closed_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["opened_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_cash_drawer_sessions_opened_by_user_id"), "cash_drawer_sessions", ["opened_by_user_id"], unique=False)
    op.create_index(op.f("ix_cash_drawer_sessions_closed_by_user_id"), "cash_drawer_sessions", ["closed_by_user_id"], unique=False)

    op.create_table(
        "cash_drawer_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("entry_type", sa.String(length=32), nullable=False),
        sa.Column("delta_cash", sa.Numeric(12, 2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["cash_drawer_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_cash_drawer_entries_session_id"), "cash_drawer_entries", ["session_id"], unique=False)
    op.create_index(op.f("ix_cash_drawer_entries_entry_type"), "cash_drawer_entries", ["entry_type"], unique=False)
    op.create_index(op.f("ix_cash_drawer_entries_order_id"), "cash_drawer_entries", ["order_id"], unique=False)
    op.create_index(op.f("ix_cash_drawer_entries_created_by_user_id"), "cash_drawer_entries", ["created_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_cash_drawer_entries_created_by_user_id"), table_name="cash_drawer_entries")
    op.drop_index(op.f("ix_cash_drawer_entries_order_id"), table_name="cash_drawer_entries")
    op.drop_index(op.f("ix_cash_drawer_entries_entry_type"), table_name="cash_drawer_entries")
    op.drop_index(op.f("ix_cash_drawer_entries_session_id"), table_name="cash_drawer_entries")
    op.drop_table("cash_drawer_entries")

    op.drop_index(op.f("ix_cash_drawer_sessions_closed_by_user_id"), table_name="cash_drawer_sessions")
    op.drop_index(op.f("ix_cash_drawer_sessions_opened_by_user_id"), table_name="cash_drawer_sessions")
    op.drop_table("cash_drawer_sessions")
