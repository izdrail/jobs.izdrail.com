from tests.conftest import auth_headers

JOB = {
    "job_url": "https://example.com/job/1",
    "job_title": "Senior Dev",
    "job_company": "TechCorp",
    "job_location": "Remote",
    "job_site": "indeed",
}


def test_create_application_requires_auth(client):
    response = client.post("/api/v1/applications", json=JOB)
    assert response.status_code == 401


def test_create_and_list_application(client):
    headers = auth_headers(client)
    response = client.post("/api/v1/applications", json=JOB, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "pending"
    assert body["statusHistory"][0]["status"] == "pending"

    listing = client.get("/api/v1/applications", headers=headers)
    assert listing.status_code == 200
    apps = listing.json()
    assert len(apps) == 1
    assert apps[0]["jobUrl"] == JOB["job_url"]
    assert apps[0]["notes"] is None


def test_duplicate_application_conflict(client):
    headers = auth_headers(client)
    client.post("/api/v1/applications", json=JOB, headers=headers)
    response = client.post("/api/v1/applications", json=JOB, headers=headers)
    assert response.status_code == 409


def test_application_rejects_non_http_url(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/v1/applications",
        json={**JOB, "job_url": "ftp://nope"},
        headers=headers,
    )
    assert response.status_code == 422


def test_patch_status_and_notes(client):
    headers = auth_headers(client)
    created = client.post("/api/v1/applications", json=JOB, headers=headers).json()

    response = client.patch(
        f"/api/v1/applications/{created['id']}",
        json={"status": "interview", "notes": "Call on Friday"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "interview"
    assert body["notes"] == "Call on Friday"
    assert [h["status"] for h in body["statusHistory"]] == ["pending", "interview"]


def test_patch_rejects_unknown_status(client):
    headers = auth_headers(client)
    created = client.post("/api/v1/applications", json=JOB, headers=headers).json()
    response = client.patch(
        f"/api/v1/applications/{created['id']}",
        json={"status": "hired"},
        headers=headers,
    )
    assert response.status_code == 422


def test_patch_other_users_application_not_found(client):
    owner = auth_headers(client, email="owner@example.com")
    created = client.post("/api/v1/applications", json=JOB, headers=owner).json()

    other = auth_headers(client, email="other@example.com")
    response = client.patch(
        f"/api/v1/applications/{created['id']}",
        json={"status": "viewed"},
        headers=other,
    )
    assert response.status_code == 404

    listing = client.get("/api/v1/applications", headers=other)
    assert listing.json() == []


def test_delete_application(client):
    headers = auth_headers(client)
    created = client.post("/api/v1/applications", json=JOB, headers=headers).json()
    response = client.delete(
        f"/api/v1/applications/{created['id']}", headers=headers
    )
    assert response.status_code == 200
    assert client.get("/api/v1/applications", headers=headers).json() == []
