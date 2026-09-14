import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..config import IAPTIC_VALIDATOR_URL, IAPTIC_API_KEY, TRIAL_DAYS
from ..database import get_db
from ..models import User, Subscription
from .auth import get_current_user

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


class VerifyRequest(BaseModel):
    platform: str
    product_id: str = Field(min_length=1, max_length=120)
    receipt: str = Field(min_length=1)

    @field_validator("platform")
    @classmethod
    def platform_must_be_known(cls, value: str) -> str:
        if value not in ("android", "ios", "web"):
            raise ValueError("platform must be android, ios or web")
        return value


def entitlement_dict(sub: Subscription | None) -> dict:
    """Compute the effective entitlement, honouring expiry timestamps."""
    now = datetime.now(timezone.utc)
    if sub is None:
        return {
            "status": "none",
            "trialStartDate": None,
            "trialEndDate": None,
            "expiresAt": None,
            "productId": None,
        }

    status = sub.status

    def as_utc(value):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

    if status == "trial" and sub.trial_end and as_utc(sub.trial_end) < now:
        status = "expired"
    if status == "active" and sub.expires_at and as_utc(sub.expires_at) < now:
        status = "expired"

    return {
        "status": status,
        "trialStartDate": sub.trial_start.isoformat() if sub.trial_start else None,
        "trialEndDate": sub.trial_end.isoformat() if sub.trial_end else None,
        "expiresAt": sub.expires_at.isoformat() if sub.expires_at else None,
        "productId": sub.product_id,
    }


@router.get("/entitlement")
def get_entitlement(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sub = (
        db.query(Subscription).filter(Subscription.user_id == user.id).first()
    )
    return entitlement_dict(sub)


@router.post("/verify")
def verify_receipt(
    req: VerifyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validate a store receipt and activate the subscription.

    The backend stays the entitlement authority: a client-side purchase
    callback alone never grants access. Verification requires a configured
    provider; without one the endpoint fails safely.
    """
    if not IAPTIC_VALIDATOR_URL or not IAPTIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "Billing verification is not configured on this server. "
                "Set JOBSWIPE_IAPTIC_VALIDATOR_URL and JOBSWIPE_IAPTIC_API_KEY."
            ),
        )

    try:
        response = httpx.post(
            IAPTIC_VALIDATOR_URL,
            json={"receipt": req.receipt, "product_id": req.product_id},
            headers={"Authorization": f"Bearer {IAPTIC_API_KEY}"},
            timeout=15.0,
        )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=502, detail="Could not reach the billing provider"
        )

    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Receipt could not be verified")

    try:
        payload = response.json()
    except ValueError:
        raise HTTPException(
            status_code=502, detail="Invalid response from the billing provider"
        )

    expires_raw = payload.get("expires_at") or payload.get("expiresAt")
    try:
        expires_at = (
            datetime.fromisoformat(str(expires_raw).replace("Z", "+00:00"))
            if expires_raw
            else None
        )
    except ValueError:
        expires_at = None

    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if sub is None:
        sub = Subscription(
            id=f"sub_{uuid.uuid4().hex[:12]}",
            user_id=user.id,
        )
        db.add(sub)

    sub.status = "active"
    sub.source = "iaptic"
    sub.product_id = req.product_id
    sub.expires_at = expires_at
    sub.receipt = req.receipt[:4000]
    db.commit()

    return entitlement_dict(sub)
