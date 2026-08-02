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


def test_admin_sets_site_url(client):
    register(client, email="admin@example.com")
    assert client.get("/api/admin/settings").json()["site_url"] == ""
    r = client.patch("/api/admin/settings", json={"site_url": " https://docent.lab.edu "})
    assert r.status_code == 200
    assert r.json()["site_url"] == "https://docent.lab.edu"  # trimmed
    assert client.get("/api/admin/settings").json()["site_url"] == "https://docent.lab.edu"


def test_admin_sets_login_message(client):
    register(client, email="admin@example.com")
    assert client.get("/api/auth/config").json()["login_message"] is None

    r = client.patch("/api/admin/settings", json={"login_message": "  Down for maintenance  "})
    assert r.status_code == 200
    assert r.json()["login_message"] == "Down for maintenance"  # trimmed
    assert client.get("/api/auth/config").json()["login_message"] == "Down for maintenance"

    client.patch("/api/admin/settings", json={"login_message": ""})
    assert client.get("/api/auth/config").json()["login_message"] is None


def test_admin_sets_map_center(client):
    register(client, email="admin@example.com")
    # Defaults to the Tennessee center baked into config.py.
    default = client.get("/api/auth/config").json()
    assert default["map_center_lat"] == 35.86
    assert default["map_center_lon"] == -86.36

    r = client.patch(
        "/api/admin/settings", json={"map_center_lat": 40.7128, "map_center_lon": -74.006}
    )
    assert r.status_code == 200
    assert r.json()["map_center_lat"] == 40.7128
    assert r.json()["map_center_lon"] == -74.006
    cfg = client.get("/api/auth/config").json()
    assert cfg["map_center_lat"] == 40.7128
    assert cfg["map_center_lon"] == -74.006


def test_admin_map_center_out_of_range_rejected(client):
    register(client, email="admin@example.com")
    r = client.patch("/api/admin/settings", json={"map_center_lat": 95})
    assert r.status_code == 422
    r = client.patch("/api/admin/settings", json={"map_center_lon": -200})
    assert r.status_code == 422


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


def test_restore_from_existing_backup_queues_sentinel(client, make_client, tmp_path, monkeypatch):
    """Restoring a server-side backup requires the typed confirmation and drops a
    sentinel the backup sidecar polls; traversal and non-admins are refused (#29)."""
    monkeypatch.setattr("app.routers.admin.BACKUP_ROOT", tmp_path)
    (tmp_path / "daily").mkdir()
    (tmp_path / "daily" / "docent-2026-07-25.dump").write_bytes(b"PGDMP\x00archive")
    register(client, email="admin@example.com")

    # Wrong confirmation → refused, no sentinel written.
    r = client.post("/api/admin/backups/restore",
                    data={"confirm": "please", "path": "daily/docent-2026-07-25.dump"})
    assert r.status_code == 400
    assert not (tmp_path / ".restore-request").exists()

    # Correct confirmation → queued, sentinel + status written.
    r = client.post("/api/admin/backups/restore",
                    data={"confirm": "RESTORE", "path": "daily/docent-2026-07-25.dump"})
    assert r.status_code == 202, r.text
    assert r.json()["state"] == "queued"
    assert (tmp_path / ".restore-request").read_text().strip() == "daily/docent-2026-07-25.dump"
    status = client.get("/api/admin/backups/restore-status").json()
    assert status["state"] == "queued" and status["backup"] == "daily/docent-2026-07-25.dump"

    # Path traversal is refused.
    assert client.post("/api/admin/backups/restore",
                       data={"confirm": "RESTORE", "path": "../secrets.dump"}).status_code == 404
    # Non-admins can't restore.
    other = make_client()
    register(other, email="pleb@example.com")
    assert other.post("/api/admin/backups/restore",
                      data={"confirm": "RESTORE", "path": "daily/docent-2026-07-25.dump"}).status_code == 403


def test_restore_from_upload_validates_and_stages(client, tmp_path, monkeypatch):
    """An uploaded .dump is magic-checked, staged under uploads/, and queued (#29)."""
    monkeypatch.setattr("app.routers.admin.BACKUP_ROOT", tmp_path)
    register(client, email="admin@example.com")

    # Not a pg_dump archive → rejected before touching anything.
    r = client.post("/api/admin/backups/restore", data={"confirm": "RESTORE"},
                    files={"file": ("evil.dump", b"rm -rf /", "application/octet-stream")})
    assert r.status_code == 400

    # A valid-looking archive is staged and queued.
    r = client.post("/api/admin/backups/restore", data={"confirm": "RESTORE"},
                    files={"file": ("mine.dump", b"PGDMP\x00archive-bytes", "application/octet-stream")})
    assert r.status_code == 202, r.text
    rel = r.json()["backup"]
    assert rel.startswith("uploads/") and rel.endswith(".dump")
    assert (tmp_path / rel).read_bytes().startswith(b"PGDMP")
    assert (tmp_path / ".restore-request").read_text().strip() == rel

    # Neither a path nor a file → 400.
    assert client.post("/api/admin/backups/restore", data={"confirm": "RESTORE"}).status_code == 400


def test_login_history_records_and_lists(client):
    register(client, email="admin@example.com", password="password123")  # admin
    # Registration itself is recorded as a "register" event...
    for _ in range(2):
        assert client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "password": "password123"},
        ).status_code == 200
    # ...alongside the two explicit "login" events.

    hist = client.get("/api/admin/login-history").json()
    assert hist["total"] == 3
    assert len(hist["recent"]) == 3
    assert hist["recent"][0]["user_email"] == "admin@example.com"
    assert {entry["event_type"] for entry in hist["recent"]} == {"login", "register"}
    assert sum(1 for e in hist["recent"] if e["event_type"] == "register") == 1
    # The daily series is zero-filled across the default 30-day window.
    assert len(hist["daily"]) == 30
    assert sum(d["logins"] for d in hist["daily"]) == 2
    assert sum(d["registrations"] for d in hist["daily"]) == 1


def test_login_history_admin_only(client, make_client):
    register(client, email="admin@example.com")  # admin
    user = make_client()
    register(user, email="user@example.com")
    assert user.get("/api/admin/login-history").status_code == 403


def test_map_radius_setting(client):
    register(client, email="admin@example.com")  # admin
    # The default surfaces in both admin settings and the public config.
    assert client.get("/api/admin/settings").json()["map_radius_km"] == 80.0
    assert client.get("/api/auth/config").json()["map_radius_km"] == 80.0

    # An admin can change it, and the public config reflects it.
    r = client.patch("/api/admin/settings", json={"map_radius_km": 25})
    assert r.status_code == 200
    assert r.json()["map_radius_km"] == 25.0
    assert client.get("/api/auth/config").json()["map_radius_km"] == 25.0

    # A non-positive radius is rejected.
    assert client.patch("/api/admin/settings", json={"map_radius_km": 0}).status_code == 422


def test_site_banner_setting(client):
    register(client, email="admin@example.com")  # admin
    # Off by default.
    assert client.get("/api/auth/config").json()["banner_message"] is None
    assert client.get("/api/admin/settings").json()["banner_level"] == "info"

    r = client.patch(
        "/api/admin/settings",
        json={"banner_message": "  Maintenance tonight  ", "banner_level": "warning"},
    )
    assert r.status_code == 200
    cfg = client.get("/api/auth/config").json()
    assert cfg["banner_message"] == "Maintenance tonight"  # trimmed
    assert cfg["banner_level"] == "warning"

    # Invalid severity is rejected.
    assert client.patch("/api/admin/settings", json={"banner_level": "boom"}).status_code == 422


def test_admin_sets_cf_analytics_snippet(client):
    register(client, email="admin@example.com")  # admin
    # Off by default: no snippet stored, no token exposed publicly.
    assert client.get("/api/admin/settings").json()["cf_analytics_snippet"] == ""
    assert client.get("/api/auth/config").json()["cf_analytics_token"] is None

    token = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
    snippet = (
        '<!-- Cloudflare Web Analytics --><script defer '
        'src="https://static.cloudflareinsights.com/beacon.min.js" '
        f"data-cf-beacon='{{\"token\": \"{token}\"}}'></script>"
    )
    r = client.patch("/api/admin/settings", json={"cf_analytics_snippet": f"  {snippet}  "})
    assert r.status_code == 200
    # The raw snippet round-trips (trimmed) for the admin form...
    assert r.json()["cf_analytics_snippet"] == snippet
    # ...while the public config exposes only the parsed token.
    assert client.get("/api/auth/config").json()["cf_analytics_token"] == token

    # A bare token pastes through too.
    client.patch("/api/admin/settings", json={"cf_analytics_snippet": token})
    assert client.get("/api/auth/config").json()["cf_analytics_token"] == token

    # Clearing it turns analytics back off.
    client.patch("/api/admin/settings", json={"cf_analytics_snippet": ""})
    assert client.get("/api/admin/settings").json()["cf_analytics_snippet"] == ""
    assert client.get("/api/auth/config").json()["cf_analytics_token"] is None


def test_cf_analytics_snippet_without_token_exposes_no_token(client):
    register(client, email="admin@example.com")
    # A non-empty snippet with nothing token-shaped in it: stored, but nothing
    # is injected (no token), so we never echo arbitrary markup onto the page.
    junk = "<script>alert('nope')</script>"
    client.patch("/api/admin/settings", json={"cf_analytics_snippet": junk})
    assert client.get("/api/admin/settings").json()["cf_analytics_snippet"] == junk
    assert client.get("/api/auth/config").json()["cf_analytics_token"] is None


def test_cf_analytics_snippet_length_capped(client):
    register(client, email="admin@example.com")
    r = client.patch("/api/admin/settings", json={"cf_analytics_snippet": "a" * 2001})
    assert r.status_code == 422
