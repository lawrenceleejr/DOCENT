"""federation v2: visit uid, federated remote_uid+status, peer sync state

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-07-22

"""
from alembic import op
import sqlalchemy as sa


revision = "a6b7c8d9e0f1"
down_revision = "f5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Visit.uid: a stable, globally-unique federation identity ---
    op.add_column("visits", sa.Column("uid", sa.String(length=36), nullable=True))
    op.execute("UPDATE visits SET uid = gen_random_uuid()::text WHERE uid IS NULL")
    op.alter_column("visits", "uid", nullable=False)
    op.create_index(op.f("ix_visits_uid"), "visits", ["uid"], unique=True)

    # --- peer sync bookkeeping ---
    op.add_column(
        "federation_peers",
        sa.Column("consecutive_failures", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column(
        "federation_peers", sa.Column("last_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "federation_peers",
        sa.Column("last_full_synced_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- federated_activities: cache; safe to clear and re-key on remote_uid ---
    op.execute("DELETE FROM federated_activities")
    op.drop_constraint("uq_federated_peer_remote", "federated_activities", type_="unique")
    op.add_column(
        "federated_activities", sa.Column("remote_uid", sa.String(length=36), nullable=False)
    )
    op.add_column(
        "federated_activities",
        sa.Column("status", sa.String(length=16), server_default="completed", nullable=False),
    )
    op.create_unique_constraint(
        "uq_federated_peer_uid", "federated_activities", ["peer_id", "remote_uid"]
    )


def downgrade() -> None:
    op.execute("DELETE FROM federated_activities")
    op.drop_constraint("uq_federated_peer_uid", "federated_activities", type_="unique")
    op.drop_column("federated_activities", "status")
    op.drop_column("federated_activities", "remote_uid")
    op.create_unique_constraint(
        "uq_federated_peer_remote", "federated_activities", ["peer_id", "remote_id"]
    )

    op.drop_column("federation_peers", "last_full_synced_at")
    op.drop_column("federation_peers", "last_updated_at")
    op.drop_column("federation_peers", "consecutive_failures")

    op.drop_index(op.f("ix_visits_uid"), table_name="visits")
    op.drop_column("visits", "uid")
