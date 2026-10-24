"""add visit attachments, next meeting, and per-company media settings

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-10-23 19:40:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'a5b6c7d8e9f0'
down_revision = 'f4a5b6c7d8e9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The two enum types are created ONCE, here, by hand.
    #
    # The columns below then refer to them with create_type=False, which
    # is the whole point: a plain sa.Enum passed to create_table makes
    # SQLAlchemy emit its own CREATE TYPE before the CREATE TABLE, and
    # that second attempt fails with 'type "attachment_kind" already
    # exists'. create_type=False says "this type is already there, just
    # reference it".
    attachment_kind = postgresql.ENUM('photo', 'audio', name='attachment_kind')
    media_retention = postgresql.ENUM('automatic', 'never', name='media_retention')
    attachment_kind.create(op.get_bind(), checkfirst=True)
    media_retention.create(op.get_bind(), checkfirst=True)

    attachment_kind_col = postgresql.ENUM(
        'photo', 'audio', name='attachment_kind', create_type=False
    )
    media_retention_col = postgresql.ENUM(
        'automatic', 'never', name='media_retention', create_type=False
    )

    # --- per-company limits -------------------------------------------
    # server_default so the companies that already exist get the same
    # numbers a new one would, without a separate backfill.
    op.add_column('organizations', sa.Column('max_visit_photos', sa.Integer(), nullable=False, server_default='3'))
    op.add_column('organizations', sa.Column('max_audio_seconds', sa.Integer(), nullable=False, server_default='180'))
    # 'never' rather than 'automatic' on purpose: a client whose data was
    # recorded before this feature existed never agreed to it being
    # deleted, and silently starting a clock on their evidence is not a
    # default anyone should inherit. Turning it on is one click.
    op.add_column(
        'organizations',
        sa.Column('media_retention', media_retention_col, nullable=False, server_default='never'),
    )
    op.add_column('organizations', sa.Column('photo_retention_months', sa.Integer(), nullable=True))
    op.add_column('organizations', sa.Column('audio_retention_months', sa.Integer(), nullable=True))

    # --- the visit's own new fields -----------------------------------
    op.add_column('visits', sa.Column('next_meeting_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_visits_next_meeting_at', 'visits', ['next_meeting_at'])

    # --- attachments ---------------------------------------------------
    op.create_table(
        'visit_attachments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('visit_id', sa.Integer(), nullable=False),
        sa.Column('kind', attachment_kind_col, nullable=False),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('purged_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['visit_id'], ['visits.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_visit_attachments_organization_id', 'visit_attachments', ['organization_id'])
    op.create_index('ix_visit_attachments_visit_id', 'visit_attachments', ['visit_id'])
    # The purge job's whole query is "expired and not yet purged", and it
    # runs over every row in the heaviest table in the system.
    op.create_index('ix_visit_attachments_expires_at', 'visit_attachments', ['expires_at'])


def downgrade() -> None:
    op.drop_index('ix_visit_attachments_expires_at', table_name='visit_attachments')
    op.drop_index('ix_visit_attachments_visit_id', table_name='visit_attachments')
    op.drop_index('ix_visit_attachments_organization_id', table_name='visit_attachments')
    op.drop_table('visit_attachments')

    op.drop_index('ix_visits_next_meeting_at', table_name='visits')
    op.drop_column('visits', 'next_meeting_at')

    op.drop_column('organizations', 'audio_retention_months')
    op.drop_column('organizations', 'photo_retention_months')
    op.drop_column('organizations', 'media_retention')
    op.drop_column('organizations', 'max_audio_seconds')
    op.drop_column('organizations', 'max_visit_photos')

    sa.Enum(name='attachment_kind').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='media_retention').drop(op.get_bind(), checkfirst=True)
