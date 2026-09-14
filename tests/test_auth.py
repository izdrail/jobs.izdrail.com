from datetime import datetime, timedelta, timezone

from jose import jwt

from api.config import SECRET_KEY, ALGORITHM
from tests.conftest import signup, auth_headers


def test_signup_returns_user_and_token(client):
    response = signup(client)
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == "user@example.com"
    assert body["token"]["token"]
    assert body["token"]["expiresAt"]


def test_signup_starts_trial_entitlement(client):
    headers = auth_headers(client)
    response = client.get("/api/v1/billing/entitlement", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "trial"
    assert body["trialEndDate"]


def test_duplicate_signup_conflict(client):
    signup(client)
    response = signup(client)
    assert response.status_code == 409


def test_signup_rejects_short_password(client):
    response = signup(client, password="123")
    assert response.status_code == 422


def test_login_success(client):
    signup(client)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "secret123"},
    )
    assert response.status_code == 200
    assert response.json()["token"]["token"]


def test_login_wrong_password(client):
    signup(client)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "wrong-pass"},
    )
    assert response.status_code == 401


def test_refresh_with_valid_token(client):
    headers = auth_headers(client)
    response = client.post("/api/v1/auth/refresh", headers=headers)
    assert response.status_code == 200
    assert response.json()["token"]["token"]


def test_refresh_with_garbage_token(client):
    response = client.post(
        "/api/v1/auth/refresh", headers={"Authorization": "Bearer not-a-token"}
    )
    assert response.status_code == 401


def test_refresh_without_token(client):
    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


def _expired_token(user_id: str, expired_days_ago: int) -> str:
    expired_at = datetime.now(timezone.utc) - timedelta(days=expired_days_ago)
    payload = {
        "sub": user_id,
        "iat": expired_at - timedelta(days=30),
        "exp": expired_at,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def test_refresh_within_grace_period(client):
    response = signup(client)
    user_id = response.json()["user"]["id"]
    token = _expired_token(user_id, expired_days_ago=2)
    response = client.post(
        "/api/v1/auth/refresh", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200


def test_refresh_beyond_grace_period_rejected(client):
    response = signup(client)
    user_id = response.json()["user"]["id"]
    token = _expired_token(user_id, expired_days_ago=30)
    response = client.post(
        "/api/v1/auth/refresh", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401
