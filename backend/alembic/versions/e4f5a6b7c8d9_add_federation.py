"""add federation peers and cached federated activities

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e4f5a6b7c8d9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


federation_interval_enum = postgresql.ENUM(
    "hour", "day", "week", name="federation_interval"
)


def upgrade() -> None:
    bind = op.get_bind()
    federation_interval_enum.create(bind, checkfirst=True)

    op.create_table(
        "federation_peers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("feed_url", sa.Text(), nullable=False),
        sa.Column(
            "interval",
            postgresql.ENUM(
                "hour", "day", "week", name="federation_interval", create_type=False
            ),
            server_default="day",
            nullable=False,
        ),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(length=16), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("activity_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "federated_activities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("peer_id", sa.Integer(), nullable=False),
        sa.Column("remote_id", sa.Integer(), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("venue_name", sa.String(length=255), nullable=True),
        sa.Column("venue_city", sa.String(length=255), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("venue_type", sa.String(length=50), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=True),
        sa.Column("person_name", sa.String(length=255), nullable=True),
        sa.Column("people_reached", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("permalink", sa.Text(), nullable=True),
        sa.Column(
            "fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["peer_id"], ["federation_peers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("peer_id", "remote_id", name="uq_federated_peer_remote"),
    )
    op.create_index(
        op.f("ix_federated_activities_peer_id"), "federated_activities", ["peer_id"], unique=False
    )
    op.create_index(
        op.f("ix_federated_activities_visit_date"),
        "federated_activities",
        ["visit_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_federated_activities_visit_date"), table_name="federated_activities")
    op.drop_index(op.f("ix_federated_activities_peer_id"), table_name="federated_activities")
    op.drop_table("federated_activities")
    op.drop_table("federation_peers")
    federation_interval_enum.drop(op.get_bind(), checkfirst=True)
