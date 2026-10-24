"""add planned_onward_distance_km and planned_return_distance_km to daily_routes

Revision ID: f1a2b3c4d5e6
Revises: e3a5dda18d8e
Create Date: 2026-10-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = 'e3a5dda18d8e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable, no default — existing routes simply have no Up/Down split
    # until they're recreated or re-optimized; the frontend falls back to
    # showing just the combined total for those.
    op.add_column('daily_routes', sa.Column('planned_onward_distance_km', sa.Float(), nullable=True))
    op.add_column('daily_routes', sa.Column('planned_return_distance_km', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('daily_routes', 'planned_return_distance_km')
    op.drop_column('daily_routes', 'planned_onward_distance_km')
