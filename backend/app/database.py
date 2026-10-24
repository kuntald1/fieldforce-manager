"""
Database engine, session factory, and declarative base.

Reads DATABASE_URL from environment (set via .env / docker-compose).
Example: postgresql+psycopg2://fieldforce:fieldforce_db@postgres:5432/fieldforce_db
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,   # avoids stale-connection errors after idle periods
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and guarantees it closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
