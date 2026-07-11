from app.config import get_settings
from tests.conftest import register


def test_register_and_me(client):
    response = register(client, email="Alice@Example.com", name="Alice")
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "alice@example.com"  # lowercased
    assert body["is_admin"] is True  # first user bootstraps as admin

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["name"] == "Alice"


def test_second_user_is_not_admin(client, make_client):
    register(client, email="first@example.com")
    second = make_client()
    response = register(second, email="second@example.com")
    assert response.json()["is_admin"] is False


def test_duplicate_email_conflict(client):
    register(client, email="dup@example.com")
    response = register(client, email="dup@example.com")
    assert response.status_code == 409


def test_access_code_required(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "invite_code", "sesame")
    assert register(client, email="a@example.com", invite_code="").status_code == 403
    assert register(client, email="a@example.com", invite_code="wrong").status_code == 403
    assert register(client, email="a@example.com", invite_code="sesame").status_code == 201


def test_registration_closed_when_no_code_configured(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "invite_code", "")
    # With no access code configured, nobody can register — even with a value.
    assert register(client, email="x@example.com", invite_code="anything").status_code == 403


def test_auth_config_endpoint(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "invite_code", "sesame")
    monkeypatch.setattr(get_settings(), "contact_email", "outreach@example.org")
    cfg = client.get("/api/auth/config").json()
    assert cfg["registration_enabled"] is True
    assert cfg["contact_email"] == "outreach@example.org"

    monkeypatch.setattr(get_settings(), "invite_code", "")
    monkeypatch.setattr(get_settings(), "contact_email", "")
    cfg = client.get("/api/auth/config").json()
    assert cfg["registration_enabled"] is False
    assert cfg["contact_email"] is None


def test_login_logout_flow(client, make_client):
    register(client, email="bob@example.com", password="password123")

    fresh = make_client()
    assert fresh.get("/api/auth/me").status_code == 401

    bad = fresh.post(
        "/api/auth/login", json={"email": "bob@example.com", "password": "nope-nope"}
    )
    assert bad.status_code == 401

    good = fresh.post(
        "/api/auth/login", json={"email": "bob@example.com", "password": "password123"}
    )
    assert good.status_code == 200
    assert "docent_token" in fresh.cookies
    assert fresh.get("/api/auth/me").status_code == 200

    fresh.post("/api/auth/logout")
    assert fresh.get("/api/auth/me").status_code == 401


def test_deactivated_user_rejected(client, make_client):
    register(client, email="admin@example.com")  # admin
    other = make_client()
    user_id = register(other, email="gone@example.com").json()["id"]

    response = client.patch(f"/api/admin/users/{user_id}", json={"is_active": False})
    assert response.status_code == 200

    # Existing session is dead and re-login is refused.
    assert other.get("/api/auth/me").status_code == 401
    relogin = other.post(
        "/api/auth/login", json={"email": "gone@example.com", "password": "password123"}
    )
    assert relogin.status_code == 401


def test_non_admin_cannot_use_admin_api(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    register(other, email="pleb@example.com")
    assert other.get("/api/admin/users").status_code == 403


def test_password_change(client):
    register(client, email="pw@example.com", password="password123")
    bad = client.patch(
        "/api/users/me",
        json={"current_password": "wrong-wrong", "new_password": "newpassword1"},
    )
    assert bad.status_code == 403
    good = client.patch(
        "/api/users/me",
        json={"current_password": "password123", "new_password": "newpassword1"},
    )
    assert good.status_code == 200
    relogin = client.post(
        "/api/auth/login", json={"email": "pw@example.com", "password": "newpassword1"}
    )
    assert relogin.status_code == 200
