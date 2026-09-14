import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Swipe
from .auth import get_current_user

router = APIRouter(prefix="/api/v1/swipes", tags=["swipes"])


class SwipeRequest(BaseModel):
    job_url: str = Field(min_length=1, max_length=2048)
    direction: str

    @field_validator("direction")
    @classmethod
    def direction_must_be_valid(cls, value: str) -> str:
        if value not in ("left", "right"):
            raise ValueError("direction must be 'left' or 'right'")
        return value


@router.post("")
def track_swipe(
    req: SwipeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    swipe = Swipe(
        id=f"swipe_{uuid.uuid4().hex[:12]}",
        user_id=user.id,
        job_url=req.job_url,
        direction=req.direction,
    )
    db.add(swipe)
    db.commit()

    return {"id": swipe.id, "direction": swipe.direction}


@router.get("")
def get_swipes(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    swipes = (
        db.query(Swipe)
        .filter(Swipe.user_id == user.id)
        .order_by(Swipe.created_at.desc())
        .all()
    )

    return [
        {
            "id": s.id,
            "jobUrl": s.job_url,
            "direction": s.direction,
            "createdAt": s.created_at.isoformat(),
        }
        for s in swipes
    ]


@router.delete("/last")
def delete_last_swipe(
    job_url: str = Query(min_length=1, max_length=2048),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove the user's most recent swipe for a job (undo support)."""
    swipe = (
        db.query(Swipe)
        .filter(Swipe.user_id == user.id, Swipe.job_url == job_url)
        .order_by(Swipe.created_at.desc())
        .first()
    )
    if not swipe:
        raise HTTPException(status_code=404, detail="No swipe found for this job")

    db.delete(swipe)
    db.commit()

    return {"deleted": True}
