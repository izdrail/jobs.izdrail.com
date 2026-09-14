import json
import uuid
from datetime import datetime, timezone

from api.models import CachedSearch
from tests.conftest import TestingSessionLocal

JOBS = [
    {
        "site": "indeed",
        "job_url": "https://example.com/job/react-1",
        "title": "React Developer",
        "company": "TechCorp",
        "location": "London",
        "job_type": "Full-time",
        "date_posted": datetime.now(timezone.utc).isoformat(),
        "min_amount": 80000,
        "max_amount": 120000,
        "is_remote": True,
        "description": "React and TypeScript role",
    },
    {
        "site": "linkedin",
        "job_url": "https://example.com/job/python-1",
        "title": "Python Engineer",
        "company": "DataInc",
        "location": "Manchester",
        "job_type": "Contract",
        "date_posted": "2020-01-01T00:00:00",
        "min_amount": None,
        "max_amount": None,
        "is_remote": False,
        "description": "Python backend with FastAPI",
    },
    {
        "site": "indeed",
        "job_url": "https://example.com/job/react-2",
        "title": "Frontend Developer",
        "company": "WebCo",
        "location": "Remote",
        "job_type": "Full-time",
        "date_posted": datetime.now(timezone.utc).isoformat(),
        "min_amount": 50000,
        "max_amount": 70000,
        "is_remote": True,
        "description": "React and CSS",
    },
]


def seed_cache(keyword="react"):
    db = TestingSessionLocal()
    db.add(
        CachedSearch(
            id=f"cache_{uuid.uuid4().hex[:12]}",
            keyword=keyword,
            results=json.dumps(JOBS),
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.close()


def test_job_detail_found(client):
    seed_cache()
    response = client.get(
        "/api/v1/jobs/detail", params={"url": "https://example.com/job/python-1"}
    )
    assert response.status_code == 200
    assert response.json()["data"]["title"] == "Python Engineer"


def test_job_detail_not_found(client):
    seed_cache()
    response = client.get(
        "/api/v1/jobs/detail", params={"url": "https://example.com/job/gone"}
    )
    assert response.status_code == 404
    assert "no longer available" in response.json()["detail"]


def test_search_pagination(client):
    seed_cache()
    page1 = client.post(
        "/api/v1/jobs/search", json={"keyword": "react", "page": 1, "page_size": 2}
    )
    assert page1.status_code == 200
    body = page1.json()
    assert body["total"] == 3
    assert len(body["data"]) == 2
    assert body["has_more"] is True

    page2 = client.post(
        "/api/v1/jobs/search", json={"keyword": "react", "page": 2, "page_size": 2}
    )
    assert len(page2.json()["data"]) == 1
    assert page2.json()["has_more"] is False


def test_search_page_size_validated(client):
    seed_cache()
    response = client.post(
        "/api/v1/jobs/search", json={"keyword": "react", "page_size": 51}
    )
    assert response.status_code == 422
    response = client.post(
        "/api/v1/jobs/search", json={"keyword": "react", "page": 0}
    )
    assert response.status_code == 422


def test_search_remote_filter(client):
    seed_cache()
    response = client.post(
        "/api/v1/jobs/search",
        json={"keyword": "react", "filters": {"is_remote": True}},
    )
    urls = [j["job_url"] for j in response.json()["data"]]
    assert "https://example.com/job/python-1" not in urls
    assert len(urls) == 2


def test_search_job_type_filter(client):
    seed_cache()
    response = client.post(
        "/api/v1/jobs/search",
        json={"keyword": "react", "filters": {"job_type": "contract"}},
    )
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["title"] == "Python Engineer"


def test_search_salary_filter(client):
    seed_cache()
    response = client.post(
        "/api/v1/jobs/search",
        json={"keyword": "react", "filters": {"min_salary": 90000}},
    )
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["job_url"] == "https://example.com/job/react-1"


def test_search_date_filter(client):
    seed_cache()
    response = client.post(
        "/api/v1/jobs/search",
        json={"keyword": "react", "filters": {"date_posted_within_days": 7}},
    )
    data = response.json()["data"]
    assert len(data) == 2
    assert all(j["site"] == "indeed" for j in data)


def test_search_site_and_tech_filters(client):
    seed_cache()
    response = client.post(
        "/api/v1/jobs/search",
        json={
            "keyword": "react",
            "filters": {"site": "linkedin", "technologies": ["fastapi"]},
        },
    )
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["title"] == "Python Engineer"


def test_legacy_search_endpoint_unchanged(client):
    seed_cache()
    response = client.post("/api/v1/jobs", json={"keyword": "react"})
    assert response.status_code == 200
    assert len(response.json()["data"]) == 3
