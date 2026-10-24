"""drop uq_agent_route_date unique constraint on daily_routes

An agent can now have more than one task (DailyRoute) on the same date —
each is its own independent row with its own priority. This drops the
old uniqueness constraint that only allowed one route per agent per day.

Revision ID: a7c9e1f2b3d4
Revises: f1a2b3c4d5e6
Create Date: 2026-10-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7c9e1f2b3d4'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('uq_agent_route_date', 'daily_routes', type_='unique')


def downgrade() -> None:
    op.create_unique_constraint('uq_agent_route_date', 'daily_routes', ['agent_id', 'route_date'])
