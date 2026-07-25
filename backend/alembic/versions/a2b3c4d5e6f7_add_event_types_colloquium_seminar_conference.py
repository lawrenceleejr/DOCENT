"""add event types: colloquium, seminar, conference (#24)

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-25

"""
from alembic import op

revision = "a2b3c4d5e6f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New talk-style event kinds (#24). Positioned after public_lecture; inserted
    # in reverse so the final enum order reads colloquium, seminar, conference.
    # Each AFTER references only the pre-existing 'public_lecture', never a value
    # added earlier in this same transaction.
    op.execute("ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'conference' AFTER 'public_lecture'")
    op.execute("ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'seminar' AFTER 'public_lecture'")
    op.execute("ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'colloquium' AFTER 'public_lecture'")


def downgrade() -> None:
    # PostgreSQL can't drop a value from an enum type; leaving the labels in
    # place is harmless (nothing references them once the app enum is reverted).
    pass
