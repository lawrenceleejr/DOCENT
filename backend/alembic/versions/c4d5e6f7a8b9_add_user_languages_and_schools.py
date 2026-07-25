"""add user languages_spoken and user_schools table

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-07-17

"""
from alembic import op
import sqlalchemy as sa

revision = "c4d5e6f7a8b9"
down_revision = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "languages_spoken",
            sa.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.create_table(
        "user_schools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "venue_id",
            sa.Integer(),
            sa.ForeignKey("venues.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "connection_id",
            sa.Integer(),
            sa.ForeignKey("connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "venue_id", name="uq_user_school"),
    )
    op.create_index("ix_user_schools_user_id", "user_schools", ["user_id"])
    op.create_index("ix_user_schools_venue_id", "user_schools", ["venue_id"])


def downgrade() -> None:
    op.drop_index("ix_user_schools_venue_id", table_name="user_schools")
    op.drop_index("ix_user_schools_user_id", table_name="user_schools")
    op.drop_table("user_schools")
    op.drop_column("users", "languages_spoken")
