"""
Production-safe first-admin seed. Unlike seed_admin.py (values hardcoded in
the file), nothing here is committed to git: pass everything as env vars.

    docker compose exec \
      -e ORG_NAME="Acme Pvt Ltd" -e ADMIN_NAME="Your Name" \
      -e ADMIN_EMAIL="you@example.com" -e ADMIN_PASSWORD='a-long-strong-one' \
      backend python scripts/seed_admin_env.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models.organization import Organization
from app.models.user import User
from app.models.enums import UserRole
from app.core.security import hash_password

WEAK = {"admin@123", "change-me-after-first-login", "password", "12345678"}


def main():
    org_name = os.environ.get("ORG_NAME", "").strip()
    name = os.environ.get("ADMIN_NAME", "").strip() or "Admin"
    email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "")

    if not (org_name and email and password):
        sys.exit("ORG_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are all required.")
    if len(password) < 10 or password.lower() in WEAK:
        sys.exit("ADMIN_PASSWORD must be at least 10 characters and not a known default.")

    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == email).first():
            print(f"User {email} already exists — nothing to do.")
            return
        org = Organization(name=org_name)
        db.add(org)
        db.flush()
        db.add(User(organization_id=org.id, name=name, email=email,
                    password_hash=hash_password(password), role=UserRole.admin))
        db.commit()
        print(f"Created organization '{org_name}' (id={org.id}) and admin {email}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
