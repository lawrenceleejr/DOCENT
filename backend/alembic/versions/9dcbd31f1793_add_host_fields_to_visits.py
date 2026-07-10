"""add host fields to visits

Revision ID: 9dcbd31f1793
Revises: cc13b602d637
Create Date: 2026-07-10 18:46:57.122443

"""
from alembic import op
import sqlalchemy as sa


revision = '9dcbd31f1793'
down_revision = 'cc13b602d637'
branch_labels = None
depends_on = None


host_relationship_enum = sa.Enum(
    'teacher_faculty', 'administrator', 'counselor', 'alumnus', 'former_student',
    'collaborator', 'community_partner', 'family_friend', 'cold_outreach', 'other',
    name='host_relationship',
)


def upgrade() -> None:
    bind = op.get_bind()
    host_relationship_enum.create(bind, checkfirst=True)
    op.add_column('visits', sa.Column('host_role', sa.String(length=255), nullable=True))
    op.add_column(
        'visits',
        sa.Column('host_relationship', host_relationship_enum, nullable=True),
    )
    op.add_column('visits', sa.Column('host_relationship_detail', sa.String(length=500), nullable=True))
    op.add_column('visits', sa.Column('host_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('visits', 'host_notes')
    op.drop_column('visits', 'host_relationship_detail')
    op.drop_column('visits', 'host_relationship')
    op.drop_column('visits', 'host_role')
    host_relationship_enum.drop(op.get_bind(), checkfirst=True)
