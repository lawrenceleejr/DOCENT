"""add reached_out host relationship (#40)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-04

"""
from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The host proactively reached out to the communicator or their
    # organization (#40) — distinct from cold_outreach (no prior connection)
    # and from a standing tie like teacher_faculty or collaborator. Positioned
    # after cold_outreach so 'other' stays last. Covers both host_relationship
    # columns (visits + connections) since they share this one Postgres type.
    op.execute(
        "ALTER TYPE host_relationship ADD VALUE IF NOT EXISTS 'reached_out' "
        "AFTER 'cold_outreach'"
    )


def downgrade() -> None:
    # Postgres has no ALTER TYPE ... DROP VALUE; removing one requires
    # rebuilding the type. Not worth it for an additive value — no-op.
    pass
