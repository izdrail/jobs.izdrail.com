from tests.conftest import auth_headers


def test_verify_fails_safely_when_unconfigured(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/v1/billing/verify",
        json={
            "platform": "android",
            "product_id": "jobswipe_monthly",
            "receipt": "fake-receipt",
        },
        headers=headers,
    )
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_verify_rejects_unknown_platform(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/v1/billing/verify",
        json={"platform": "toaster", "product_id": "x", "receipt": "y"},
        headers=headers,
    )
    assert response.status_code == 422


def test_entitlement_requires_auth(client):
    response = client.get("/api/v1/billing/entitlement")
    assert response.status_code == 401


def test_device_register_dedupe_and_delete(client):
    headers = auth_headers(client)
    payload = {"platform": "android", "token": "fcm-token-123"}

    first = client.post("/api/v1/devices", json=payload, headers=headers)
    assert first.status_code == 200
    second = client.post("/api/v1/devices", json=payload, headers=headers)
    assert second.json()["id"] == first.json()["id"]

    deleted = client.delete(
        f"/api/v1/devices/{first.json()['id']}", headers=headers
    )
    assert deleted.status_code == 200

    missing = client.delete(
        f"/api/v1/devices/{first.json()['id']}", headers=headers
    )
    assert missing.status_code == 404


def test_device_requires_auth(client):
    response = client.post(
        "/api/v1/devices", json={"platform": "android", "token": "x"}
    )
    assert response.status_code == 401


def test_swipe_direction_validated(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/v1/swipes",
        json={"job_url": "https://example.com/j/1", "direction": "up"},
        headers=headers,
    )
    assert response.status_code == 422


def test_swipe_undo_removes_last(client):
    headers = auth_headers(client)
    url = "https://example.com/j/1"
    client.post(
        "/api/v1/swipes", json={"job_url": url, "direction": "left"}, headers=headers
    )
    response = client.delete(
        "/api/v1/swipes/last", params={"job_url": url}, headers=headers
    )
    assert response.status_code == 200
    assert client.get("/api/v1/swipes", headers=headers).json() == []

    missing = client.delete(
        "/api/v1/swipes/last", params={"job_url": url}, headers=headers
    )
    assert missing.status_code == 404
