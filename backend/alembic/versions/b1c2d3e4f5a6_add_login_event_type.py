"""add event_type to login_events (registrations join the login history)

Revision ID: b1c2d3e4f5a6
Revises: a2b3c4d5e6f7
Create Date: 2026-07-30

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "b1c2d3e4f5a6"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


login_event_type_enum = postgresql.ENUM("login", "register", name="login_event_type")


def upgrade() -> None:
    bind = op.get_bind()
    login_event_type_enum.create(bind, checkfirst=True)
    op.add_column(
        "login_events",
        sa.Column(
            "event_type",
            postgresql.ENUM("login", "register", name="login_event_type", create_type=False),
            server_default="login",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("login_events", "event_type")
    login_event_type_enum.drop(op.get_bind(), checkfirst=True)
