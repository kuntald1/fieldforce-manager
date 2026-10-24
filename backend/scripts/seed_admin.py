"""
One-off script to create the first organization + admin user.
Run inside the backend container (or locally against the same DATABASE_URL):

    docker compose exec backend python scripts/seed_admin.py

Edit the values below before running, or wire it up to argparse/env vars
later if you need to onboard multiple client organizations this way.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models.organization import Organization
from app.models.user import User
from app.models.enums import UserRole
from app.core.security import hash_password

ORG_NAME = "Demo Client Pvt Ltd"
ADMIN_NAME = "Admin User"
ADMIN_EMAIL = "admin@demo-client.test"
ADMIN_PASSWORD = "change-me-after-first-login"


def main():
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if existing:
            print(f"User {ADMIN_EMAIL} already exists — nothing to do.")
            return

        org = Organization(name=ORG_NAME)
        db.add(org)
        db.flush()  # assigns org.id without committing yet

        admin = User(
            organization_id=org.id,
            name=ADMIN_NAME,
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            role=UserRole.admin,
        )
        db.add(admin)
        db.commit()

        print(f"Created organization '{org.name}' (id={org.id})")
        print(f"Created admin user {ADMIN_EMAIL} (password: {ADMIN_PASSWORD})")
        print("Log in via POST /api/auth/login, then change the password.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
