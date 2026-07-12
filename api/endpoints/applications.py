import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Application, Swipe
from .auth import get_current_user

router = APIRouter(prefix="/api/v1/applications", tags=["applications"])


class ApplicationRequest(BaseModel):
    job_url: str
    job_title: str | None = None
    job_company: str | None = None
    job_location: str | None = None
    job_description: str | None = None
    job_site: str | None = None


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

    application = Application(
        id=f"app_{uuid.uuid4().hex[:12]}",
        user_id=user.id,
        job_url=req.job_url,
        job_title=req.job_title,
        job_company=req.job_company,
        job_location=req.job_location,
        job_description=req.job_description,
        job_site=req.job_site,
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

    return {
        "id": application.id,
        "jobUrl": application.job_url,
        "status": application.status,
        "createdAt": application.created_at.isoformat(),
    }


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

    return [
        {
            "id": a.id,
            "jobUrl": a.job_url,
            "jobTitle": a.job_title,
            "jobCompany": a.job_company,
            "jobLocation": a.job_location,
            "jobSite": a.job_site,
            "status": a.status,
            "createdAt": a.created_at.isoformat(),
        }
        for a in apps
    ]


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
