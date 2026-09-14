from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    DateTime,
    Text,
    Integer,
    ForeignKey,
    UniqueConstraint,
)

from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class CachedSearch(Base):
    __tablename__ = "cached_searches"

    id = Column(String, primary_key=True, index=True)
    keyword = Column(String, index=True, nullable=False)
    results = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class Swipe(Base):
    __tablename__ = "swipes"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    job_url = Column(String, nullable=False)
    direction = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)


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
    notes = Column(Text, nullable=True)
    # JSON list of {"status": str, "at": iso8601} entries, oldest first.
    status_history = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(
        String, ForeignKey("users.id"), nullable=False, unique=True, index=True
    )
    # trial | active | expired | none
    status = Column(String, default="none", nullable=False)
    # trial | iaptic | play_store
    source = Column(String, nullable=True)
    product_id = Column(String, nullable=True)
    trial_start = Column(DateTime, nullable=True)
    trial_end = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    receipt = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (
        UniqueConstraint("user_id", "platform", "token", name="uq_device_user_token"),
    )

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    platform = Column(String, nullable=False)  # android | ios | web
    token = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(
        String, ForeignKey("users.id"), nullable=False, unique=True, index=True
    )
    skills = Column(Text, nullable=True)  # JSON list of strings
    desired_role = Column(String, nullable=True)
    location = Column(String, nullable=True)
    remote_preference = Column(String, nullable=True)  # remote|onsite|hybrid|any
    resume_original_name = Column(String, nullable=True)
    resume_stored_name = Column(String, nullable=True)
    resume_content_type = Column(String, nullable=True)
    resume_size = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
