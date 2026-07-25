"""add language column to visits

Revision ID: b3c4d5e6f7a8
Revises: 55a5efd17c3a
Create Date: 2026-07-17

"""
from alembic import op
import sqlalchemy as sa

revision = "b3c4d5e6f7a8"
down_revision = "55a5efd17c3a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("visits", sa.Column("language", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("visits", "language")
