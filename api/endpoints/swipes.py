import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Swipe
from .auth import get_current_user

router = APIRouter(prefix="/api/v1/swipes", tags=["swipes"])


class SwipeRequest(BaseModel):
    job_url: str
    direction: str


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
