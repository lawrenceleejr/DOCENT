"""add app_setting key/value table

Revision ID: e1a2b3c4d5e6
Revises: d97bf1596965
Create Date: 2026-07-11

"""
from alembic import op
import sqlalchemy as sa

revision = "e1a2b3c4d5e6"
down_revision = "d97bf1596965"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_setting",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("app_setting")
