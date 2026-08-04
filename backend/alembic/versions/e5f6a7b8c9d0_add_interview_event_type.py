"""add interview event type (#39)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-04

"""
from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A media/press interview (podcast, radio, …) — a kind of event that isn't a
    # "visit". Positioned after workshop so 'other' stays last (#39).
    op.execute(
        "ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'interview' AFTER 'workshop'"
    )


def downgrade() -> None:
    # Postgres has no ALTER TYPE ... DROP VALUE; additive value left in place.
    pass
