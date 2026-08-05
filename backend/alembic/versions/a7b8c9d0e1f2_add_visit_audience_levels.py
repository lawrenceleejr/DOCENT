"""add visits.audience_levels multi-select (#42)

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-04

An event can target several audience levels at once. `audience_levels` is the
array source of truth; the existing scalar `audience_level` is kept as the
primary (always the first element) for back-compat with the federation feed,
CSV/DB export, and single-badge displays.
"""
from alembic import op

revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Array of the existing native `audience_level` enum type.
    op.execute(
        "ALTER TABLE visits "
        "ADD COLUMN audience_levels audience_level[] NOT NULL DEFAULT '{}'"
    )
    # Backfill: every existing event's multi-select starts as its single level.
    op.execute("UPDATE visits SET audience_levels = ARRAY[audience_level]")


def downgrade() -> None:
    op.drop_column("visits", "audience_levels")
