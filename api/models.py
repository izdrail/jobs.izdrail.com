from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Text, Boolean, ForeignKey

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class CachedSearch(Base):
    __tablename__ = "cached_searches"

    id = Column(String, primary_key=True, index=True)
    keyword = Column(String, index=True, nullable=False)
    results = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Swipe(Base):
    __tablename__ = "swipes"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    job_url = Column(String, nullable=False)
    direction = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Application(Base):
    __tablename__ = "applications"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    job_url = Column(String, nullable=False)
    job_title = Column(String, nullable=True)
    job_company = Column(String, nullable=True)
    job_location = Column(String, nullable=True)
    job_description = Column(Text, nullable=True)
    job_site = Column(String, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
