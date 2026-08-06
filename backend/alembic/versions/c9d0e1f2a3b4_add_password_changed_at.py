"""add users.password_changed_at for session revocation

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-08-06

Sessions issued before this timestamp are rejected, so a password change (or
admin reset) logs the account out everywhere. Null (the backfill for existing
rows) keeps every current token valid — nothing is revoked by the upgrade
itself.
"""
from alembic import op
import sqlalchemy as sa

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "password_changed_at")
