from tests.conftest import create_venue, register


def create_connection(client, venue_id, **overrides):
    payload = {"venue_id": venue_id, "name": "Jane Doe", **overrides}
    response = client.post("/api/connections", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_list_connection(client):
    register(client, email="admin@example.com")
    venue = create_venue(client)
    connection = create_connection(
        client,
        venue["id"],
        role="5th grade teacher",
        relationship_type="teacher_faculty",
        email="jane@school.edu",
        notes="Great contact for classroom visits.",
    )
    assert connection["name"] == "Jane Doe"
    assert connection["role"] == "5th grade teacher"
    assert connection["relationship_type"] == "teacher_faculty"
    assert connection["added_by"]["name"] == "Test User"

    listed = client.get("/api/connections", params={"venue_id": venue["id"]})
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == connection["id"]


def test_connection_requires_existing_venue(client):
    register(client, email="admin@example.com")
    response = client.post("/api/connections", json={"venue_id": 999999, "name": "Nobody"})
    assert response.status_code == 404


def test_duplicate_name_at_same_venue_conflicts(client):
    register(client, email="admin@example.com")
    venue = create_venue(client)
    create_connection(client, venue["id"], name="Jane Doe")
    dup = client.post("/api/connections", json={"venue_id": venue["id"], "name": "Jane Doe"})
    assert dup.status_code == 409


def test_same_name_allowed_at_different_venues(client):
    register(client, email="admin@example.com")
    venue_a = create_venue(client, name="School A")
    venue_b = create_venue(client, name="School B")
    create_connection(client, venue_a["id"], name="Jane Doe")
    ok = client.post("/api/connections", json={"venue_id": venue_b["id"], "name": "Jane Doe"})
    assert ok.status_code == 201


def test_only_owner_or_admin_can_modify(client, make_client):
    register(client, email="admin@example.com")  # first user = admin
    owner = make_client()
    register(owner, email="owner@example.com")
    stranger = make_client()
    register(stranger, email="stranger@example.com")

    venue = create_venue(owner)
    connection = create_connection(owner, venue["id"])

    denied = stranger.patch(f"/api/connections/{connection['id']}", json={"role": "Hijacked"})
    assert denied.status_code == 403
    assert stranger.delete(f"/api/connections/{connection['id']}").status_code == 403

    by_owner = owner.patch(f"/api/connections/{connection['id']}", json={"role": "Principal"})
    assert by_owner.status_code == 200
    assert by_owner.json()["role"] == "Principal"

    by_admin = client.patch(
        f"/api/connections/{connection['id']}", json={"notes": "Confirmed by admin"}
    )
    assert by_admin.status_code == 200

    assert owner.delete(f"/api/connections/{connection['id']}").status_code == 204
    assert client.get("/api/connections", params={"venue_id": venue["id"]}).json() == []
