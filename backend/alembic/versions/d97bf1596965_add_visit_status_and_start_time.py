"""add visit status and start_time

Revision ID: d97bf1596965
Revises: 258fc3dd0647
Create Date: 2026-07-10 20:45:39.112637

"""
from alembic import op
import sqlalchemy as sa


revision = 'd97bf1596965'
down_revision = '258fc3dd0647'
branch_labels = None
depends_on = None


visit_status_enum = sa.Enum('planned', 'completed', name='visit_status')


def upgrade() -> None:
    bind = op.get_bind()
    visit_status_enum.create(bind, checkfirst=True)
    # server_default backfills existing rows as 'completed' (they are logged, past visits).
    op.add_column(
        'visits',
        sa.Column('status', visit_status_enum, server_default='completed', nullable=False),
    )
    op.add_column('visits', sa.Column('start_time', sa.Time(), nullable=True))
    op.create_index(op.f('ix_visits_status'), 'visits', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_visits_status'), table_name='visits')
    op.drop_column('visits', 'start_time')
    op.drop_column('visits', 'status')
    visit_status_enum.drop(op.get_bind(), checkfirst=True)
