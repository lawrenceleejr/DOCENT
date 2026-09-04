"""add visit.is_broadcast for remote/in-person reach split (#38)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-04

"""
import sqlalchemy as sa

from alembic import op

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "visits",
        sa.Column(
            "is_broadcast",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Backfill: existing events held at an online venue type are remote reach,
    # so land historical podcasts/videos in the remote curve rather than
    # in-person (#38). New events default to in-person (false) and the form
    # prefills the flag from the venue type.
    #
    # `venue_type::text` (not the bare enum) is deliberate: when this runs in the
    # same transaction as the migration that ADDs those enum values (a fresh DB,
    # or any upgrade that spans both), Postgres rejects using a not-yet-committed
    # enum value ("unsafe use of new value"). Comparing the text representation
    # sidesteps that entirely.
    op.execute(
        """
        UPDATE visits SET is_broadcast = true
        WHERE venue_id IN (
            SELECT id FROM venues
            WHERE venue_type::text IN ('youtube_channel', 'podcast', 'social_media', 'blog')
        )
        """
    )

    # The federation cache mirrors the flag so a sibling's remote reach lands in
    # the remote curve too (#38). Backfill cached online-venue-type activities;
    # the rest refresh on the next sync from peers running the new feed version.
    op.add_column(
        "federated_activities",
        sa.Column(
            "is_broadcast",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.execute(
        """
        UPDATE federated_activities SET is_broadcast = true
        WHERE venue_type::text IN ('youtube_channel', 'podcast', 'social_media', 'blog')
        """
    )


def downgrade() -> None:
    op.drop_column("federated_activities", "is_broadcast")
    op.drop_column("visits", "is_broadcast")
