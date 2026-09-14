import io

from tests.conftest import auth_headers


def test_profile_defaults(client):
    headers = auth_headers(client)
    response = client.get("/api/v1/profile", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["skills"] == []
    assert body["resume"] is None


def test_profile_update(client):
    headers = auth_headers(client)
    response = client.put(
        "/api/v1/profile",
        json={
            "skills": ["Python", "FastAPI"],
            "desired_role": "Backend Engineer",
            "location": "London",
            "remote_preference": "remote",
        },
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["skills"] == ["Python", "FastAPI"]
    assert body["remotePreference"] == "remote"


def test_profile_rejects_bad_remote_preference(client):
    headers = auth_headers(client)
    response = client.put(
        "/api/v1/profile",
        json={"remote_preference": "wherever"},
        headers=headers,
    )
    assert response.status_code == 422


def test_resume_upload_txt(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/v1/profile/resume",
        files={"file": ("resume.txt", io.BytesIO(b"my cv"), "text/plain")},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["resume"]["originalName"] == "resume.txt"


def test_resume_upload_pdf_magic_bytes(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/v1/profile/resume",
        files={
            "file": ("resume.pdf", io.BytesIO(b"not really a pdf"), "application/pdf")
        },
        headers=headers,
    )
    assert response.status_code == 400

    ok = client.post(
        "/api/v1/profile/resume",
        files={
            "file": (
                "resume.pdf",
                io.BytesIO(b"%PDF-1.4 fake body"),
                "application/pdf",
            )
        },
        headers=headers,
    )
    assert ok.status_code == 200


def test_resume_upload_rejects_executable(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/v1/profile/resume",
        files={"file": ("evil.exe", io.BytesIO(b"MZ"), "application/x-msdownload")},
        headers=headers,
    )
    assert response.status_code == 400


def test_resume_delete(client):
    headers = auth_headers(client)
    client.post(
        "/api/v1/profile/resume",
        files={"file": ("resume.txt", io.BytesIO(b"cv"), "text/plain")},
        headers=headers,
    )
    deleted = client.delete("/api/v1/profile/resume", headers=headers)
    assert deleted.status_code == 200
    again = client.delete("/api/v1/profile/resume", headers=headers)
    assert again.status_code == 404


def test_profile_requires_auth(client):
    assert client.get("/api/v1/profile").status_code == 401
