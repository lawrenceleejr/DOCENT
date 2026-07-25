"""add audience_level to cached federated activities

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-07-22

"""
from alembic import op
import sqlalchemy as sa


revision = "f5a6b7c8d9e0"
down_revision = "e4f5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "federated_activities",
        sa.Column("audience_level", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("federated_activities", "audience_level")
