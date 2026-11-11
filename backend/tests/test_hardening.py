"""Regression tests for the pre-release security audit."""
import pytest

from app.models import FederationPeer
from app.services import federation as fed
from app.services.csvsafe import safe_cell
from tests.conftest import create_venue, create_visit, register

# --- cross-site request guard ------------------------------------------------

def test_cross_site_write_is_refused(client):
    register(client)
    venue = create_venue(client)
    resp = client.post(
        "/api/visits",
        json={"venue_id": venue["id"]},
        headers={"Sec-Fetch-Site": "cross-site"},
    )
    assert resp.status_code == 403
    # A sibling subdomain is "same-site" to the cookie but still not us.
    resp = client.delete(f"/api/venues/{venue['id']}", headers={"Sec-Fetch-Site": "same-site"})
    assert resp.status_code == 403
    # Older browsers send only Origin; a foreign one is refused too.
    resp = client.delete(
        f"/api/venues/{venue['id']}", headers={"Origin": "https://evil.example"}
    )
    assert resp.status_code == 403
    assert client.get(f"/api/venues/{venue['id']}").status_code == 200


def test_same_origin_and_non_browser_writes_pass(client):
    register(client)
    # The app itself (same-origin fetch), with and without the port nginx drops.
    for headers in (
        {"Sec-Fetch-Site": "same-origin"},
        {"Origin": "http://testserver"},
        {"Origin": "http://testserver:8080"},
        {},
    ):
        resp = client.post(
            "/api/venues",
            json={"name": f"Hall {len(headers)}{list(headers.values())}", "venue_type": "library"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
    # Reads are never blocked — a link from another site must still open.
    assert client.get("/api/venues", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 200


# --- venue deletion ------------------------------------------------------------

def test_member_cannot_delete_a_venue_holding_someone_elses_events(client, make_client):
    register(client, email="admin@example.com")
    owner = make_client()
    register(owner, email="owner@example.com")
    other = make_client()
    register(other, email="other@example.com")

    venue = create_venue(owner, name="Shared Hall", city="Town")
    theirs = create_visit(owner, venue["id"], title="Owner's event")
    # Logging one event grants stewardship of the venue — but not the right to
    # take the owner's events down with it.
    create_visit(other, venue["id"], title="Other's event")
    assert other.delete(f"/api/venues/{venue['id']}").status_code == 409
    assert owner.delete(f"/api/venues/{venue['id']}").status_code == 409
    assert owner.get(f"/api/visits/{theirs['id']}").status_code == 200
    # An admin still can.
    assert client.delete(f"/api/venues/{venue['id']}").status_code == 204


# --- calendar feed token ---------------------------------------------------------

def test_calendar_feed_token_is_scoped_to_its_owner(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    register(other, email="other@example.com")
    venue = create_venue(client)
    create_visit(client, venue["id"], status="planned", visit_date="2030-01-15", title="Mine")
    create_visit(other, venue["id"], status="planned", visit_date="2030-01-16", title="Theirs")

    path = client.get("/api/users/me/calendar-feed").json()["path"]
    anon = make_client()
    text = anon.get(path + "&everyone=true").text
    assert "Mine" in text and "Theirs" not in text
    other_id = other.get("/api/auth/me").json()["id"]
    text = anon.get(f"{path}&author_id={other_id}").text
    assert "Theirs" not in text
    # The signed-in download keeps the community-wide option.
    assert "Theirs" in client.get("/api/visits/calendar.ics", params={"everyone": "true"}).text


def test_password_change_revokes_the_calendar_feed(client, make_client):
    register(client, password="password123")
    path = client.get("/api/users/me/calendar-feed").json()["path"]
    anon = make_client()
    assert anon.get(path).status_code == 200
    resp = client.patch(
        "/api/users/me",
        json={"current_password": "password123", "new_password": "a-new-password"},
    )
    assert resp.status_code in (200, 204), resp.text
    assert anon.get(path).status_code == 401
    assert anon.get(client.get("/api/users/me/calendar-feed").json()["path"]).status_code == 200


def test_malformed_feed_token_is_a_401_not_a_crash(make_client):
    anon = make_client()
    for token in ("1.é", "abc", "", "1."):
        assert anon.get("/api/visits/calendar.ics", params={"token": token}).status_code == 401


# --- input validation ------------------------------------------------------------

@pytest.mark.parametrize("url", ["javascript:alert(1)", "data:text/html,x", "vbscript:x"])
def test_venue_url_rejects_non_web_schemes(client, url):
    register(client)
    resp = client.post(
        "/api/venues", json={"name": "Hall", "venue_type": "library", "url": url}
    )
    assert resp.status_code == 422


def test_venue_url_is_normalized(client):
    register(client)
    venue = create_venue(client, name="A", url="example.org/visit")
    assert venue["url"] == "https://example.org/visit"
    venue = create_venue(client, name="B", url="  ")
    assert venue["url"] is None
    resp = client.patch(f"/api/venues/{venue['id']}", json={"url": "javascript:alert(1)"})
    assert resp.status_code == 422


def test_explicit_null_on_a_required_field_is_a_validation_error(client):
    register(client)
    venue = create_venue(client)
    visit = create_visit(client, venue["id"])
    for body in ({"title": None}, {"visit_date": None}, {"status": None}):
        assert client.patch(f"/api/visits/{visit['id']}", json=body).status_code == 422
    assert client.patch(f"/api/venues/{venue['id']}", json={"name": None}).status_code == 422
    # Clearing an optional field is still fine.
    assert client.patch(f"/api/visits/{visit['id']}", json={"reflection": None}).status_code == 200


def test_absurd_dates_are_rejected_and_the_feed_survives(client):
    register(client)
    venue = create_venue(client)
    resp = client.post(
        "/api/visits",
        json={
            "venue_id": venue["id"], "visit_date": "9999-12-31", "status": "planned",
            "event_type": "talk", "title": "Far future", "audience_level": "general_public",
        },
    )
    assert resp.status_code == 422
    assert client.get("/api/visits/calendar.ics", params={"everyone": "true"}).status_code == 200


def test_oversized_notes_are_rejected(client):
    register(client)
    venue = create_venue(client)
    visit = create_visit(client, venue["id"])
    resp = client.patch(f"/api/visits/{visit['id']}", json={"reflection": "x" * 20_001})
    assert resp.status_code == 422


# --- CSV exports -------------------------------------------------------------------

def test_safe_cell_neutralizes_formulas():
    assert safe_cell('=HYPERLINK("http://evil","x")') == "'=HYPERLINK(\"http://evil\",\"x\")"
    assert safe_cell("+1") == "'+1" and safe_cell("@sum") == "'@sum" and safe_cell("-2") == "'-2"
    assert safe_cell("Plain title") == "Plain title"
    assert safe_cell(42) == 42 and safe_cell(None) is None


def test_csv_exports_neutralize_formulas(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], title="=1+1")
    export = client.get("/api/visits/export.csv").text
    assert "'=1+1" in export and ",=1+1" not in export
    report = client.get("/api/reports/activities", params={"format": "csv", "scope": "all"}).text
    assert "'=1+1" in report and ",=1+1" not in report


def test_unreadable_csv_import_is_a_400(client):
    register(client)
    huge_cell = "title,date\n" + "x" * 200_000 + ",2026-01-01\n"
    resp = client.post(
        "/api/imports/events/parse", files={"file": ("big.csv", huge_cell, "text/csv")}
    )
    assert resp.status_code == 400


# --- federation ----------------------------------------------------------------------

def _feed(*activities):
    return {"generated_at": "2026-01-01T00:00:00+00:00", "activities": list(activities)}


def test_hostile_peer_rows_are_sanitized(db, monkeypatch):
    peer = FederationPeer(feed_url="https://peer.example/api/federation/feed?token=sekrit")
    db.add(peer)
    db.flush()
    rows = _feed(
        {
            "uid": "a" * 36, "remote_id": 1, "visit_date": "2026-01-02",
            "venue_name": "V" * 5000, "people_reached": 10**12,
            "permalink": "javascript:alert(1)", "latitude": "north",
        },
        {"uid": "b" * 400, "remote_id": 2, "visit_date": "2026-01-02"},  # uid too long
        {"uid": "c", "remote_id": 3, "visit_date": "not-a-date"},
        "not even an object",
    )
    monkeypatch.setattr(fed, "fetch_peer", lambda *a, **k: rows)
    fed.sync_peer(db, peer)
    assert peer.last_status == "ok", peer.last_error
    assert peer.activity_count == 1
    from app.models import FederatedActivity

    row = db.query(FederatedActivity).one()
    assert len(row.venue_name) == 255
    assert row.permalink is None and row.latitude is None
    assert row.people_reached == 500_000_000


def test_failed_sync_is_recorded_with_the_token_masked(db, monkeypatch):
    peer = FederationPeer(feed_url="https://peer.example/api/federation/feed?token=sekrit")
    db.add(peer)
    db.flush()

    def boom(*a, **k):
        raise RuntimeError(
            "Server error for url 'https://peer.example/api/federation/feed?token=sekrit&limit=5'"
        )

    monkeypatch.setattr(fed, "fetch_peer", boom)
    fed.sync_peer(db, peer)
    assert peer.last_status == "error" and peer.consecutive_failures == 1
    assert "sekrit" not in peer.last_error and "token=•••" in peer.last_error
