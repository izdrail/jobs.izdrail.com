import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Application, Swipe
from .auth import get_current_user

router = APIRouter(prefix="/api/v1/applications", tags=["applications"])

ALLOWED_STATUSES = {"pending", "viewed", "interview", "offer", "rejected"}


class ApplicationRequest(BaseModel):
    job_url: str = Field(min_length=1, max_length=2048)
    job_title: str | None = Field(default=None, max_length=300)
    job_company: str | None = Field(default=None, max_length=300)
    job_location: str | None = Field(default=None, max_length=500)
    job_description: str | None = None
    job_site: str | None = Field(default=None, max_length=60)

    @field_validator("job_url")
    @classmethod
    def job_url_must_be_http(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("job_url must be an http(s) URL")
        return value


class ApplicationPatch(BaseModel):
    status: str | None = None
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("status")
    @classmethod
    def status_must_be_known(cls, value: str | None) -> str | None:
        if value is not None and value not in ALLOWED_STATUSES:
            raise ValueError(
                f"status must be one of: {', '.join(sorted(ALLOWED_STATUSES))}"
            )
        return value


def application_dict(a: Application) -> dict:
    try:
        history = json.loads(a.status_history) if a.status_history else []
    except (ValueError, TypeError):
        history = []
    return {
        "id": a.id,
        "jobUrl": a.job_url,
        "jobTitle": a.job_title,
        "jobCompany": a.job_company,
        "jobLocation": a.job_location,
        "jobSite": a.job_site,
        "status": a.status,
        "notes": a.notes,
        "statusHistory": history,
        "createdAt": a.created_at.isoformat(),
    }


@router.post("")
def create_application(
    req: ApplicationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(Application)
        .filter(Application.user_id == user.id, Application.job_url == req.job_url)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already applied to this job")

    now = datetime.now(timezone.utc)
    application = Application(
        id=f"app_{uuid.uuid4().hex[:12]}",
        user_id=user.id,
        job_url=req.job_url,
        job_title=req.job_title,
        job_company=req.job_company,
        job_location=req.job_location,
        job_description=req.job_description,
        job_site=req.job_site,
        status_history=json.dumps([{"status": "pending", "at": now.isoformat()}]),
    )
    db.add(application)

    swipe = Swipe(
        id=f"swipe_{uuid.uuid4().hex[:12]}",
        user_id=user.id,
        job_url=req.job_url,
        direction="right",
    )
    db.add(swipe)

    db.commit()

    return application_dict(application)


@router.get("")
def get_applications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    apps = (
        db.query(Application)
        .filter(Application.user_id == user.id)
        .order_by(Application.created_at.desc())
        .all()
    )

    return [application_dict(a) for a in apps]


@router.patch("/{application_id}")
def update_application(
    application_id: str,
    req: ApplicationPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    app = (
        db.query(Application)
        .filter(Application.id == application_id, Application.user_id == user.id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if req.status is not None and req.status != app.status:
        try:
            history = json.loads(app.status_history) if app.status_history else []
        except (ValueError, TypeError):
            history = []
        history.append(
            {
                "status": req.status,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        app.status = req.status
        app.status_history = json.dumps(history)

    if req.notes is not None:
        app.notes = req.notes

    db.commit()

    return application_dict(app)


@router.delete("/{application_id}")
def delete_application(
    application_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    app = (
        db.query(Application)
        .filter(Application.id == application_id, Application.user_id == user.id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    db.delete(app)
    db.commit()

    return {"deleted": True}
