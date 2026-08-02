"""add online venue types: youtube_channel, podcast, social_media, blog

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-08-02

"""
from alembic import op

revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Distributed/online outreach channels. Positioned after community_center
    # (so "other" stays last); inserted in reverse so the final enum order reads
    # youtube_channel, podcast, social_media, blog. Each AFTER references only the
    # pre-existing 'community_center', never a value added earlier here.
    op.execute("ALTER TYPE venue_type ADD VALUE IF NOT EXISTS 'blog' AFTER 'community_center'")
    op.execute("ALTER TYPE venue_type ADD VALUE IF NOT EXISTS 'social_media' AFTER 'community_center'")
    op.execute("ALTER TYPE venue_type ADD VALUE IF NOT EXISTS 'podcast' AFTER 'community_center'")
    op.execute("ALTER TYPE venue_type ADD VALUE IF NOT EXISTS 'youtube_channel' AFTER 'community_center'")


def downgrade() -> None:
    # PostgreSQL can't drop a value from an enum type; leaving the labels in
    # place is harmless (nothing references them once the app enum is reverted).
    pass
