import json
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..config import (
    UPLOAD_DIR,
    MAX_RESUME_BYTES,
    ALLOWED_RESUME_EXTENSIONS,
)
from ..database import get_db
from ..models import User, UserProfile
from .auth import get_current_user

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])

ALLOWED_REMOTE_PREFERENCES = {"remote", "onsite", "hybrid", "any"}


class ProfileUpdate(BaseModel):
    skills: list[str] | None = Field(default=None, max_length=50)
    desired_role: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    remote_preference: str | None = None

    @field_validator("skills")
    @classmethod
    def skills_must_be_short(cls, value: list[str] | None) -> list[str] | None:
        if value is not None:
            for skill in value:
                if len(skill) > 50:
                    raise ValueError("skills must be 50 characters or fewer")
        return value

    @field_validator("remote_preference")
    @classmethod
    def preference_must_be_known(cls, value: str | None) -> str | None:
        if value is not None and value not in ALLOWED_REMOTE_PREFERENCES:
            raise ValueError(
                "remote_preference must be one of: "
                + ", ".join(sorted(ALLOWED_REMOTE_PREFERENCES))
            )
        return value


def get_or_create_profile(db: Session, user: User) -> UserProfile:
    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    )
    if profile is None:
        profile = UserProfile(
            id=f"prof_{uuid.uuid4().hex[:12]}",
            user_id=user.id,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def profile_dict(profile: UserProfile) -> dict:
    try:
        skills = json.loads(profile.skills) if profile.skills else []
    except (ValueError, TypeError):
        skills = []
    return {
        "skills": skills,
        "desiredRole": profile.desired_role,
        "location": profile.location,
        "remotePreference": profile.remote_preference,
        "resume": (
            {
                "originalName": profile.resume_original_name,
                "contentType": profile.resume_content_type,
                "size": profile.resume_size,
            }
            if profile.resume_stored_name
            else None
        ),
        "updatedAt": profile.updated_at.isoformat() if profile.updated_at else None,
    }


@router.get("")
def get_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, user)
    return profile_dict(profile)


@router.put("")
def update_profile(
    req: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_or_create_profile(db, user)

    if req.skills is not None:
        profile.skills = json.dumps(req.skills)
    if req.desired_role is not None:
        profile.desired_role = req.desired_role
    if req.location is not None:
        profile.location = req.location
    if req.remote_preference is not None:
        profile.remote_preference = req.remote_preference

    db.commit()
    db.refresh(profile)
    return profile_dict(profile)


@router.post("/resume")
async def upload_resume(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Never trust the client-provided filename or content type: the extension
    # allowlist and (for PDFs) magic-byte check decide what gets stored.
    original_name = os.path.basename(file.filename or "resume")
    extension = os.path.splitext(original_name)[1].lower()
    if extension not in ALLOWED_RESUME_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file type. Allowed: "
                + ", ".join(sorted(ALLOWED_RESUME_EXTENSIONS))
            ),
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds the 5 MB limit")

    if extension == ".pdf" and not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file")

    profile = get_or_create_profile(db, user)

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Remove any previous resume file.
    if profile.resume_stored_name:
        old_path = os.path.join(UPLOAD_DIR, profile.resume_stored_name)
        if os.path.isfile(old_path):
            os.remove(old_path)

    stored_name = f"{user.id}_{uuid.uuid4().hex}{extension}"
    with open(os.path.join(UPLOAD_DIR, stored_name), "wb") as out:
        out.write(content)

    profile.resume_original_name = original_name[:255]
    profile.resume_stored_name = stored_name
    profile.resume_content_type = file.content_type or "application/octet-stream"
    profile.resume_size = len(content)
    db.commit()
    db.refresh(profile)

    return profile_dict(profile)


@router.delete("/resume")
def delete_resume(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    )
    if not profile or not profile.resume_stored_name:
        raise HTTPException(status_code=404, detail="No resume uploaded")

    path = os.path.join(UPLOAD_DIR, profile.resume_stored_name)
    if os.path.isfile(path):
        os.remove(path)

    profile.resume_original_name = None
    profile.resume_stored_name = None
    profile.resume_content_type = None
    profile.resume_size = None
    db.commit()

    return {"deleted": True}
