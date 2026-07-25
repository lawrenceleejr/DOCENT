"""add connections

Revision ID: 800669c6b0b4
Revises: a3c4d5e6f7a8
Create Date: 2026-07-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '800669c6b0b4'
down_revision = 'a3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # host_relationship enum already exists (created by 9dcbd31f1793) — reuse
    # it. Must use postgresql.ENUM (not the generic sa.Enum) for create_type=
    # False to actually be honored during CREATE TABLE compilation.
    host_relationship_enum = postgresql.ENUM(
        'teacher_faculty', 'administrator', 'counselor', 'alumnus', 'former_student',
        'collaborator', 'community_partner', 'family_friend', 'cold_outreach', 'other',
        name='host_relationship',
        create_type=False,
    )
    op.create_table('connections',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('venue_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('role', sa.String(length=255), nullable=True),
    sa.Column('relationship_type', host_relationship_enum, nullable=True),
    sa.Column('relationship_detail', sa.String(length=500), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('phone', sa.String(length=50), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('added_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['added_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['venue_id'], ['venues.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('venue_id', 'name', name='uq_connection_venue_name')
    )
    op.create_index(op.f('ix_connections_venue_id'), 'connections', ['venue_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_connections_venue_id'), table_name='connections')
    op.drop_table('connections')
