"""add former_teacher relationship

Revision ID: 55a5efd17c3a
Revises: 800669c6b0b4
Create Date: 2026-07-18 00:00:00.000000

"""
from alembic import op


revision = '55a5efd17c3a'
down_revision = '800669c6b0b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # "This person used to teach me" is a relationship to the communicator,
    # distinct from teacher_faculty (their current role at the venue) and
    # former_student (the mirror-image relationship already in the enum).
    op.execute(
        "ALTER TYPE host_relationship ADD VALUE IF NOT EXISTS 'former_teacher' "
        "AFTER 'former_student'"
    )


def downgrade() -> None:
    # Postgres has no ALTER TYPE ... DROP VALUE; removing one requires
    # rebuilding the type (rename, recreate, migrate columns, drop old type).
    # Not worth the disruption for an additive enum value — left as a no-op.
    pass
