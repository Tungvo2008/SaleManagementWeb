"""add import cost fields

Revision ID: d2b1a8b1d001
Revises: 8549ab6f8a8f
Create Date: 2026-02-25 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'd2b1a8b1d001'
down_revision = '8549ab6f8a8f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cost_price', sa.Numeric(precision=12, scale=2), nullable=True))

    with op.batch_alter_table('stock_units', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cost_roll_price', sa.Numeric(precision=12, scale=2), nullable=True))
        batch_op.add_column(sa.Column('cost_per_m', sa.Numeric(precision=12, scale=4), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('stock_units', schema=None) as batch_op:
        batch_op.drop_column('cost_per_m')
        batch_op.drop_column('cost_roll_price')

    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.drop_column('cost_price')
