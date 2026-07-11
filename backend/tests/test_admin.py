from tests.conftest import register


def test_admin_sets_invite_code(client, make_client):
    register(client, email="admin@example.com")  # first user = admin

    # Admin changes the access code.
    r = client.patch("/api/admin/settings", json={"invite_code": "newsecret"})
    assert r.status_code == 200
    assert r.json()["invite_code"] == "newsecret"

    # The public config reflects it; the old code no longer works, the new one does.
    assert client.get("/api/auth/config").json()["registration_enabled"] is True
    other = make_client()
    assert register(other, email="a@example.com", invite_code="test-invite-code").status_code == 403
    assert register(other, email="a@example.com", invite_code="newsecret").status_code == 201


def test_admin_closes_registration_by_clearing_code(client, make_client):
    register(client, email="admin@example.com")
    client.patch("/api/admin/settings", json={"invite_code": ""})
    assert client.get("/api/auth/config").json()["registration_enabled"] is False
    other = make_client()
    assert register(other, email="nope@example.com", invite_code="anything").status_code == 403


def test_admin_sets_contact_email(client):
    register(client, email="admin@example.com")
    client.patch("/api/admin/settings", json={"contact_email": "help@lab.org"})
    assert client.get("/api/auth/config").json()["contact_email"] == "help@lab.org"


def test_admin_changes_user_email(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    uid = register(other, email="old@example.com").json()["id"]

    r = client.patch(f"/api/admin/users/{uid}", json={"email": "New@Example.com"})
    assert r.status_code == 200
    assert r.json()["email"] == "new@example.com"  # normalized

    # The user can log in with the new email.
    fresh = make_client()
    assert fresh.post(
        "/api/auth/login", json={"email": "new@example.com", "password": "password123"}
    ).status_code == 200


def test_admin_email_change_conflict(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    uid = register(other, email="taker@example.com").json()["id"]
    # Can't take the admin's email.
    r = client.patch(f"/api/admin/users/{uid}", json={"email": "admin@example.com"})
    assert r.status_code == 409


def test_admin_user_search_and_pagination(client, make_client):
    register(client, email="admin@example.com", name="Ada Admin")
    for i in range(5):
        c = make_client()
        register(c, email=f"grace{i}@example.com", name=f"Grace {i}")

    all_users = client.get("/api/admin/users").json()
    assert all_users["total"] == 6

    # Search by name.
    grace = client.get("/api/admin/users", params={"q": "grace"}).json()
    assert grace["total"] == 5

    # Search by email fragment.
    one = client.get("/api/admin/users", params={"q": "grace3@"}).json()
    assert one["total"] == 1
    assert one["items"][0]["email"] == "grace3@example.com"

    # Pagination.
    page1 = client.get("/api/admin/users", params={"page": 1, "page_size": 2}).json()
    assert len(page1["items"]) == 2
    assert page1["total"] == 6


def test_non_admin_cannot_change_settings(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    register(other, email="pleb@example.com")
    assert other.get("/api/admin/settings").status_code == 403
    assert other.patch("/api/admin/settings", json={"invite_code": "x"}).status_code == 403


from tests.conftest import create_venue, create_visit  # noqa: E402


def test_venue_merge(client):
    register(client, email="admin@example.com")  # admin
    keep = create_venue(client, name="Lincoln Elementary", city="Knoxville")
    dup = create_venue(client, name="Lincoln Elem.", city="Knoxville")
    create_visit(client, keep["id"], title="a")
    create_visit(client, dup["id"], title="b")

    r = client.post(f"/api/venues/{keep['id']}/merge", json={"from_ids": [dup["id"]]})
    assert r.status_code == 200, r.text
    assert r.json()["visit_count"] == 2
    assert client.get(f"/api/venues/{dup['id']}").status_code == 404


def test_venue_merge_requires_admin(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    register(other, email="pleb@example.com")
    keep = create_venue(client, name="A", city="X")
    dup = create_venue(client, name="B", city="Y")
    assert other.post(f"/api/venues/{keep['id']}/merge", json={"from_ids": [dup['id']]}).status_code == 403


def test_user_merge_reassigns_visits(client, make_client):
    admin = register(client, email="admin@example.com").json()
    other = make_client()
    dup = register(other, email="dup@example.com").json()
    v = create_venue(other, name="Dup Venue", city="Town")
    create_visit(other, v["id"], title="orphan")

    # Can't delete a user who still has visits.
    assert client.delete(f"/api/admin/users/{dup['id']}").status_code == 409

    # Merge moves the visits to the target, then removes the dup account.
    r = client.post(f"/api/admin/users/{dup['id']}/merge", json={"into_id": admin["id"]})
    assert r.status_code == 200, r.text
    users = client.get("/api/admin/users").json()
    assert all(u["email"] != "dup@example.com" for u in users["items"])
    mine = client.get("/api/visits", params={"author_id": admin["id"]}).json()
    assert mine["total"] >= 1


def test_cannot_delete_or_merge_self(client):
    admin = register(client, email="admin@example.com").json()
    assert client.delete(f"/api/admin/users/{admin['id']}").status_code == 400
    assert client.post(
        f"/api/admin/users/{admin['id']}/merge", json={"into_id": admin["id"]}
    ).status_code == 400


def test_delete_user_without_visits(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    uid = register(other, email="empty@example.com").json()["id"]
    assert client.delete(f"/api/admin/users/{uid}").status_code == 204


def test_admin_institution_manual_crud(client):
    register(client, email="admin@example.com")
    r = client.post(
        "/api/admin/institutions",
        json={
            "name": "L&N STEM Academy",
            "institution_type": "school",
            "latitude": 35.965,
            "longitude": -83.926,
            "city": "Knoxville",
            "state": "TN",
            "region": "Manual",
        },
    )
    assert r.status_code == 201, r.text
    iid = r.json()["id"]

    found = client.get("/api/admin/institutions", params={"q": "L&N"}).json()
    assert found["total"] == 1
    assert found["items"][0]["source"] == "manual"

    assert client.patch(f"/api/admin/institutions/{iid}", json={"city": "Knoxville"}).status_code == 200

    regions = client.get("/api/admin/institutions/regions").json()
    assert any(rec["region"] == "Manual" for rec in regions)

    assert client.delete(f"/api/admin/institutions/{iid}").status_code == 204
    assert client.get("/api/admin/institutions", params={"q": "L&N"}).json()["total"] == 0


def test_admin_institution_missing_coords_requires_location(client):
    register(client, email="admin@example.com")
    r = client.post(
        "/api/admin/institutions", json={"name": "No Coords", "institution_type": "library"}
    )
    assert r.status_code == 400


def test_admin_institution_delete_region(client):
    register(client, email="admin@example.com")
    for i in range(3):
        client.post(
            "/api/admin/institutions",
            json={
                "name": f"Lib {i}",
                "institution_type": "library",
                "latitude": 1.0,
                "longitude": 2.0,
                "region": "TestRegion",
            },
        )
    res = client.post("/api/admin/institutions/delete-region", params={"region": "TestRegion"})
    assert res.status_code == 200
    assert res.json()["deleted"] == 3


def test_backups_endpoints_and_traversal_guard(client, make_client):
    register(client, email="admin@example.com")
    r = client.get("/api/admin/backups")
    assert r.status_code == 200
    assert "items" in r.json() and "count" in r.json()
    # Path traversal is refused.
    assert client.get(
        "/api/admin/backups/download", params={"path": "../etc/passwd"}
    ).status_code == 404
    other = make_client()
    register(other, email="pleb@example.com")
    assert other.get("/api/admin/backups").status_code == 403
