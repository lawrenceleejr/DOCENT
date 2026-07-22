from tests.conftest import create_venue, create_visit, register


def _seed_and_export(client):
    register(client)  # first user = admin
    venue = create_venue(client)
    create_visit(client, venue["id"], title="Export me", tags=["demo"], language="Spanish")
    r = client.get("/api/admin/db/export")
    assert r.status_code == 200
    assert r.headers["content-disposition"].endswith(".json")
    return r.json()


def test_export_shape(client):
    payload = _seed_and_export(client)
    assert payload["docent_export_version"] == 1
    assert any(u["email"] == "user@example.com" for u in payload["users"])
    assert payload["venues"][0]["name"] == "Lincoln Elementary"
    assert payload["visits"][0]["title"] == "Export me"
    assert payload["visits"][0]["tags"] == ["demo"]
    assert payload["visits"][0]["language"] == "Spanish"


def test_reimport_is_idempotent(client):
    payload = _seed_and_export(client)
    result = client.post("/api/admin/db/import", json=payload).json()
    # Everything already exists → nothing new, the one visit is skipped.
    assert result["users_created"] == 0
    assert result["venues_created"] == 0
    assert result["visits_created"] == 0
    assert result["visits_skipped"] == 1


def test_import_merges_new_records(client):
    payload = _seed_and_export(client)
    payload["visits"].append(
        {
            "author_email": "user@example.com",
            "venue": {"name": "Lincoln Elementary", "city": "Knoxville"},
            "status": "completed",
            "visit_date": "2027-01-01",
            "event_type": "workshop",
            "title": "Brand new",
            "people_reached": 12,
            "audience_level": "mixed",
            "tags": ["fresh"],
            "language": "French",
        }
    )
    result = client.post("/api/admin/db/import", json=payload).json()
    assert result["visits_created"] == 1
    listing = client.get("/api/visits", params={"tags": "fresh"}).json()
    assert listing["total"] == 1
    assert listing["items"][0]["language"] == "French"


def test_import_ignores_unknown_language(client):
    payload = _seed_and_export(client)
    payload["visits"].append(
        {
            "author_email": "user@example.com",
            "venue": {"name": "Lincoln Elementary", "city": "Knoxville"},
            "status": "completed",
            "visit_date": "2027-02-02",
            "event_type": "workshop",
            "title": "Unknown language",
            "people_reached": 5,
            "audience_level": "mixed",
            "language": "Klingon",
        }
    )
    result = client.post("/api/admin/db/import", json=payload).json()
    assert result["visits_created"] == 1
    listing = client.get("/api/visits", params={"q": "Unknown language"}).json()
    assert listing["items"][0]["language"] is None


def test_import_creates_placeholder_author(client):
    payload = _seed_and_export(client)
    payload["users"].append({"email": "guest@other.edu", "name": "Guest", "is_admin": True})
    result = client.post("/api/admin/db/import", json=payload).json()
    assert result["users_created"] == 1
    # placeholder must NOT be able to log in (inactive, unknown password)
    login = client.post(
        "/api/auth/login", json={"email": "guest@other.edu", "password": "password123"}
    )
    assert login.status_code == 401


def test_import_rejects_junk(client):
    register(client)
    assert client.post("/api/admin/db/import", json={"foo": "bar"}).status_code == 400


def test_db_tools_admin_only(client, make_client):
    register(client)
    other = make_client()
    register(other, email="other@example.com")
    assert other.get("/api/admin/db/export").status_code == 403
    assert other.post("/api/admin/db/import", json={}).status_code == 403
