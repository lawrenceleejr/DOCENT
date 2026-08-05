"""add restaurant_bar and concert_venue venue types (#53)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-08-05

Add-only enum extensions. No data statement uses the new values, so this is
safe to apply in the same transaction that creates them.
"""
from alembic import op

revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE venue_type ADD VALUE IF NOT EXISTS 'restaurant_bar' "
        "AFTER 'community_center'"
    )
    op.execute(
        "ALTER TYPE venue_type ADD VALUE IF NOT EXISTS 'concert_venue' "
        "AFTER 'restaurant_bar'"
    )


def downgrade() -> None:
    # Postgres can't drop enum values; leaving them is harmless.
    pass
