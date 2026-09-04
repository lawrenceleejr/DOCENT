"""add url to venues

Revision ID: c3d4e5f6a7b8
Revises: c2d3e4f5a6b7
Create Date: 2026-08-02

"""
import sqlalchemy as sa

from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("venues", sa.Column("url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("venues", "url")
