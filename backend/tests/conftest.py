import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://docent:docent@localhost:5432/docent_test",
)

# TestClient talks plain http, so secure-only cookies would never be sent back.
get_settings().cookie_secure = False


def _ensure_test_database() -> None:
    admin_url = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres"
    db_name = TEST_DATABASE_URL.rsplit("/", 1)[1]
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": db_name}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session")
def engine():
    _ensure_test_database()
    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def make_client(db):
    """Factory for additional independent clients (separate cookie jars)."""
    created = []

    def _make():
        app.dependency_overrides[get_db] = lambda: db
        test_client = TestClient(app)
        created.append(test_client)
        return test_client

    yield _make
    for test_client in created:
        test_client.close()
    app.dependency_overrides.clear()


def register(client, email="user@example.com", name="Test User", password="password123", **extra):
    response = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": password, **extra},
    )
    return response


VENUE = {
    "name": "Lincoln Elementary",
    "venue_type": "elementary_school",
    "city": "Knoxville",
    "state": "TN",
}

VISIT = {
    "visit_date": "2026-03-14",
    "event_type": "classroom_visit",
    "title": "Why the sky is blue",
    "people_reached": 30,
    "audience_level": "elementary",
}


def create_venue(client, **overrides):
    response = client.post("/api/venues", json={**VENUE, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def create_visit(client, venue_id, **overrides):
    response = client.post(
        "/api/visits", json={**VISIT, "venue_id": venue_id, **overrides}
    )
    assert response.status_code == 201, response.text
    return response.json()
