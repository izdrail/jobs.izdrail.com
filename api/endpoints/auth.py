import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

import bcrypt
from jose import jwt, JWTError

from ..config import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRY_DAYS,
    REFRESH_GRACE_DAYS,
    TRIAL_DAYS,
)
from ..database import get_db
from ..models import User, Subscription

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=256)
    name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class AuthResponse(BaseModel):
    user: dict
    token: dict


def create_token(user_id: str) -> dict:
    expires_at = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRY_DAYS)
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": expires_at,
    }
    token_str = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return {"token": token_str, "expiresAt": expires_at.isoformat()}


def user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "createdAt": user.created_at.isoformat(),
    }


def start_trial(db: Session, user_id: str) -> Subscription:
    now = datetime.now(timezone.utc)
    subscription = Subscription(
        id=f"sub_{uuid.uuid4().hex[:12]}",
        user_id=user_id,
        status="trial",
        source="trial",
        trial_start=now,
        trial_end=now + timedelta(days=TRIAL_DAYS),
    )
    db.add(subscription)
    return subscription


@router.post("/signup", response_model=AuthResponse)
def sign_up(req: SignUpRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(
            status_code=409, detail="An account with this email already exists"
        )

    hashed = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt())
    user = User(
        id=f"user_{uuid.uuid4().hex[:12]}",
        email=req.email,
        name=req.name or req.email.split("@")[0],
        hashed_password=hashed.decode("utf-8"),
    )
    db.add(user)
    start_trial(db, user.id)
    db.commit()
    db.refresh(user)

    return AuthResponse(user=user_dict(user), token=create_token(user.id))


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not bcrypt.checkpw(
        req.password.encode("utf-8"), user.hashed_password.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return AuthResponse(user=user_dict(user), token=create_token(user.id))


security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    return user


@router.post("/refresh", response_model=AuthResponse)
def refresh_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
):
    """Exchange a current (or recently expired) token for a fresh one.

    A token that is still valid is refreshed directly. An expired token is
    honoured for REFRESH_GRACE_DAYS after expiry so active users are not
    logged out mid-session; anything older or malformed is rejected.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        try:
            payload = jwt.decode(
                token,
                SECRET_KEY,
                algorithms=[ALGORITHM],
                options={"verify_exp": False},
            )
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")

        exp = payload.get("exp")
        if exp is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        expired_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        if datetime.now(timezone.utc) > expired_at + timedelta(
            days=REFRESH_GRACE_DAYS
        ):
            raise HTTPException(status_code=401, detail="Session expired")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    return AuthResponse(user=user_dict(user), token=create_token(user.id))
