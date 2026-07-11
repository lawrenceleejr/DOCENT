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
