"""add dashboard menu item + role permissions for admin/manager/agent

Lets the new Dashboard page (4 pie charts) show up in the sidebar for
every role, without a manual DB edit — menu_items/menu_role_permissions
are plain data rows, not seeded anywhere else in code, so this is the
only place a new nav entry can come from.

Revision ID: b4d8f3a6c7e9
Revises: a7c9e1f2b3d4
Create Date: 2026-10-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b4d8f3a6c7e9'
down_revision = 'a7c9e1f2b3d4'
branch_labels = None
depends_on = None

menu_items = sa.table(
    "menu_items",
    sa.column("id", sa.Integer),
    sa.column("key", sa.String),
    sa.column("label", sa.String),
    sa.column("sort_order", sa.Integer),
)
menu_role_permissions = sa.table(
    "menu_role_permissions",
    sa.column("role", sa.String),
    sa.column("menu_item_id", sa.Integer),
)


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(menu_items.insert().values(key="dashboard", label="Dashboard", sort_order=-1))
    row = conn.execute(sa.text("SELECT id FROM menu_items WHERE key = 'dashboard'")).first()
    menu_item_id = row[0]
    conn.execute(
        menu_role_permissions.insert(),
        [
            {"role": "admin", "menu_item_id": menu_item_id},
            {"role": "manager", "menu_item_id": menu_item_id},
            {"role": "agent", "menu_item_id": menu_item_id},
        ],
    )


def downgrade() -> None:
    conn = op.get_bind()
    row = conn.execute(sa.text("SELECT id FROM menu_items WHERE key = 'dashboard'")).first()
    if row:
        menu_item_id = row[0]
        conn.execute(sa.text("DELETE FROM menu_role_permissions WHERE menu_item_id = :id"), {"id": menu_item_id})
        conn.execute(sa.text("DELETE FROM menu_items WHERE id = :id"), {"id": menu_item_id})
