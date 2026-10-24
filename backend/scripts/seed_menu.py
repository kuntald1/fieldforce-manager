"""
One-off / idempotent script to seed menu items and which roles can see them.
Run inside the backend container:

    docker compose exec backend python scripts/seed_menu.py

Edit MENU_SEED and re-run any time to add a new screen or change who can
see an existing one — this is the actual permission control, not code.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models.menu import MenuItem, MenuRolePermission

# (key, label, sort_order, roles allowed to see it)
#
# "superadmin" is listed on every screen a company admin can see, because
# a superadmin working inside a client company (having switched their
# token to it — see auth.switch_company) needs the same screens that
# company's own admin has. "companies" is the one screen only they get.
MENU_SEED = [
    ("companies", "Companies", 0, ["superadmin"]),  # tenant administration — creating client companies and their first admin
    ("customers", "Customers", 1, ["superadmin", "admin", "manager", "agent"]),
    ("tasks", "Tasks", 2, ["superadmin", "admin", "manager"]),
    ("my_tasks", "My Tasks", 2, ["agent"]),  # same slot, agent-only — their own read-only task list, not the full manager Tasks screen
    ("live_tracking", "Live Tracking", 3, ["superadmin", "admin", "manager", "agent"]),
    ("approvals", "Approvals", 4, ["superadmin", "admin", "manager"]),  # review agents' incomplete-task requests
    ("scheduled_meetings", "Scheduled Meetings", 4, ["superadmin", "admin", "manager"]),
    ("travel_allowance", "Travel Allowance", 5, ["superadmin", "admin", "manager"]),
    ("attendance", "Attendance", 5, ["superadmin", "admin", "manager"]),
    ("expenses", "Expenses", 5, ["superadmin", "admin", "manager"]),
    ("reports", "Reports", 5, ["superadmin", "admin", "manager"]),
    ("my_expenses", "My Expenses", 2, ["agent"]),  # agent's own, same slot family as my_tasks
    ("employees", "Employees", 6, ["superadmin", "admin"]),  # admin-only — creating logins/assigning roles is sensitive
    ("settings", "Settings", 7, ["superadmin", "admin"]),  # admin-only — org-wide defaults (TA rate, deviation threshold, geofence radius)
]


def main():
    db = SessionLocal()
    try:
        for key, label, sort_order, roles in MENU_SEED:
            item = db.query(MenuItem).filter(MenuItem.key == key).first()
            if not item:
                item = MenuItem(key=key, label=label, sort_order=sort_order)
                db.add(item)
                db.flush()
                print(f"Created menu item '{key}'")
            else:
                item.label = label
                item.sort_order = sort_order

            for role in roles:
                exists = (
                    db.query(MenuRolePermission)
                    .filter_by(role=role, menu_item_id=item.id)
                    .first()
                )
                if not exists:
                    db.add(MenuRolePermission(role=role, menu_item_id=item.id))
                    print(f"Granted '{key}' to role '{role}'")

        db.commit()
        print("Menu seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
