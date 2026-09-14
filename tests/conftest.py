import os
import sys
import tempfile

import pytest

# Isolate the app database and uploads before the app modules are imported.
_TMP = tempfile.mkdtemp(prefix="jobswipe-tests-")
os.environ["JOBSWIPE_DATABASE_URL"] = f"sqlite:///{os.path.join(_TMP, 'test.db')}"
os.environ["JOBSWIPE_UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["JOBSWIPE_IAPTIC_VALIDATOR_URL"] = ""
os.environ["JOBSWIPE_IAPTIC_API_KEY"] = ""

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from api.database import Base, get_db  # noqa: E402
from main import app  # noqa: E402

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def db_session():
    return TestingSessionLocal()


@pytest.fixture
def client():
    return TestClient(app)


def signup(client, email="user@example.com", password="secret123", name="Test User"):
    return client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": password, "name": name},
    )


def auth_headers(client, email="user@example.com", password="secret123"):
    response = signup(client, email=email, password=password)
    assert response.status_code == 200, response.text
    token = response.json()["token"]["token"]
    return {"Authorization": f"Bearer {token}"}
