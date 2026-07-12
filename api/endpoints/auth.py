import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

import bcrypt
from jose import jwt, JWTError

from ..database import get_db
from ..models import User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

SECRET_KEY = "jobswipe-secret-key-change-in-production"
ALGORITHM = "HS256"
TOKEN_EXPIRY_DAYS = 30


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    user: dict
    token: dict


def create_token(user_id: str) -> dict:
    expires_at = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRY_DAYS)
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": expires_at,
    }
    token_str = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return {"token": token_str, "expiresAt": expires_at.isoformat()}


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
    db.commit()
    db.refresh(user)

    return AuthResponse(
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "createdAt": user.created_at.isoformat(),
        },
        token=create_token(user.id),
    )


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not bcrypt.checkpw(
        req.password.encode("utf-8"), user.hashed_password.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return AuthResponse(
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "createdAt": user.created_at.isoformat(),
        },
        token=create_token(user.id),
    )


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
