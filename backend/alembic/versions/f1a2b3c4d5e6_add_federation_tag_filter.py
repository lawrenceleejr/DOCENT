"""federate visit tags and a per-sibling tag filter (#31)

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-07-25

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f1a2b3c4d5e6"
down_revision = "e0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tags carried on each cached sibling activity (published in feed v3)...
    op.add_column(
        "federated_activities",
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    # ...and the subscriber's per-sibling tag filter (empty = pull everything).
    op.add_column(
        "federation_peers",
        sa.Column(
            "tag_filter",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("federation_peers", "tag_filter")
    op.drop_column("federated_activities", "tags")
