"""add user position

Revision ID: d3e4f5a6b7c8
Revises: c4d5e6f7a8b9
Create Date: 2026-07-17

"""
from alembic import op
import sqlalchemy as sa

revision = "d3e4f5a6b7c8"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("position", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "position")
