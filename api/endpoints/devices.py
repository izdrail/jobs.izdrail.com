import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, Device
from .auth import get_current_user

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])


class DeviceRequest(BaseModel):
    platform: str
    token: str = Field(min_length=1, max_length=512)

    @field_validator("platform")
    @classmethod
    def platform_must_be_known(cls, value: str) -> str:
        if value not in ("android", "ios", "web"):
            raise ValueError("platform must be android, ios or web")
        return value


@router.post("")
def register_device(
    req: DeviceRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(Device)
        .filter(
            Device.user_id == user.id,
            Device.platform == req.platform,
            Device.token == req.token,
        )
        .first()
    )
    if existing:
        return {"id": existing.id, "registered": True}

    device = Device(
        id=f"dev_{uuid.uuid4().hex[:12]}",
        user_id=user.id,
        platform=req.platform,
        token=req.token,
    )
    db.add(device)
    db.commit()

    return {"id": device.id, "registered": True}


@router.delete("/{device_id}")
def deregister_device(
    device_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    device = (
        db.query(Device)
        .filter(Device.id == device_id, Device.user_id == user.id)
        .first()
    )
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    db.delete(device)
    db.commit()

    return {"deleted": True}
