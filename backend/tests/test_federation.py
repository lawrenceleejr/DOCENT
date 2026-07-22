from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from sqlalchemy import select

from app.models import FederatedActivity, FederationInterval, FederationPeer
from app.services import federation as fed
from tests.conftest import create_venue, create_visit, register

SAMPLE_ENVELOPE = {
    "instance_name": "Sibling Lab",
    "instance_url": "https://sib.example.edu",
    "generated_at": "2026-07-01T00:00:00Z",
    "activities": [
        {
            "remote_id": 1, "visit_date": "2026-05-01", "venue_name": "Sib School",
            "venue_city": "Elsewhere", "latitude": 40.0, "longitude": -80.0,
            "venue_type": "high_school", "event_type": "workshop",
            "person_name": "Remote Person", "people_reached": 22,
            "permalink": "https://sib.example.edu/visits/1",
        },
        {
            "remote_id": 2, "visit_date": "2026-06-01", "venue_name": "Sib Museum",
            "venue_city": "Elsewhere", "latitude": 41.0, "longitude": -81.0,
            "venue_type": "museum", "event_type": "lab_tour",
            "person_name": "Remote Person", "people_reached": 10,
            "permalink": "https://sib.example.edu/visits/2",
        },
    ],
}


def _enable_publishing(client) -> str:
    """Turn on the feed and return the feed token from the admin settings."""
    client.patch(
        "/api/admin/settings",
        json={"federation_publish": True, "site_url": "https://primary.example.edu"},
    )
    settings = client.get("/api/admin/settings").json()
    assert settings["federation_publish"] is True
    feed_url = settings["federation_feed_url"]
    assert feed_url.startswith("https://primary.example.edu/api/federation/activities?token=")
    return parse_qs(urlparse(feed_url).query)["token"][0]


def test_feed_404_when_publishing_disabled(client):
    register(client)  # admin
    assert client.get("/api/federation/activities", params={"token": "x"}).status_code == 404


def test_feed_403_on_bad_or_missing_token(client):
    register(client)
    _enable_publishing(client)
    assert client.get("/api/federation/activities").status_code == 403
    assert client.get("/api/federation/activities", params={"token": "wrong"}).status_code == 403


def test_feed_exposes_only_completed_limited_fields(client, make_client):
    register(client)
    venue = create_venue(client, latitude=35.9, longitude=-84.0)
    create_visit(
        client,
        venue["id"],
        title="Star party",
        people_reached=40,
        reflection="secret private reflection",
        rating=5,
        contact_name="Jane Host",
        contact_email="jane@host.example",
        host_notes="private host notes",
    )
    create_visit(
        client, venue["id"], title="Planned only", status="planned",
        visit_date="2099-01-01", people_reached=0,
    )
    token = _enable_publishing(client)

    # A tokened, cookie-less client (like a sibling instance / curl).
    anon = make_client()
    r = anon.get("/api/federation/activities", params={"token": token})
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["instance_url"] == "https://primary.example.edu"
    assert len(body["activities"]) == 1  # planned excluded
    row = body["activities"][0]

    # Feed-safe fields present...
    assert row["venue_name"] == "Lincoln Elementary"
    assert row["venue_city"] == "Knoxville"
    assert row["person_name"] == "Test User"
    assert row["event_type"] == "classroom_visit"
    assert row["venue_type"] == "elementary_school"
    assert row["people_reached"] == 40
    assert row["latitude"] == 35.9
    assert row["permalink"] == f"https://primary.example.edu/visits/{row['remote_id']}"

    # ...and NO private fields leak.
    blob = r.text.lower()
    assert "secret private reflection" not in blob
    assert "private host notes" not in blob
    assert "jane@host.example" not in blob
    for private in ("reflection", "rating", "host_notes", "contact_email", "description"):
        assert private not in row


def test_rotate_token_changes_feed_url(client):
    register(client)
    first = _enable_publishing(client)
    rotated = client.post("/api/admin/federation/rotate-token").json()
    new_url = rotated["federation_feed_url"]
    assert first not in new_url  # old token no longer valid


# --- Consuming side: sync service ---

def test_due_math():
    now = datetime(2026, 7, 1, tzinfo=timezone.utc)
    peer = FederationPeer(
        feed_url="x", interval=FederationInterval.day, enabled=True, last_synced_at=None
    )
    assert fed.due(peer, now) is True  # never synced
    peer.last_synced_at = now - timedelta(hours=23)
    assert fed.due(peer, now) is False  # not yet a day
    peer.last_synced_at = now - timedelta(hours=25)
    assert fed.due(peer, now) is True
    peer.enabled = False
    assert fed.due(peer, now) is False  # disabled never due


def test_sync_peer_upserts_prunes_dedups(db, monkeypatch):
    peer = FederationPeer(
        feed_url="https://sib.example.edu/api/federation/activities?token=t",
        interval=FederationInterval.day,
    )
    db.add(peer)
    db.commit()
    db.refresh(peer)

    monkeypatch.setattr(fed, "fetch_peer", lambda url: SAMPLE_ENVELOPE)
    fed.sync_peer(db, peer)

    rows = db.scalars(
        select(FederatedActivity).where(FederatedActivity.peer_id == peer.id)
    ).all()
    assert {r.remote_id for r in rows} == {1, 2}
    assert peer.last_status == "ok"
    assert peer.activity_count == 2
    assert peer.label == "Sibling Lab"  # adopted from the feed manifest

    # Second sync: drop id 2, add id 3, change id 1's people_reached.
    envelope2 = {
        **SAMPLE_ENVELOPE,
        "activities": [
            {**SAMPLE_ENVELOPE["activities"][0], "people_reached": 99},
            {
                "remote_id": 3, "visit_date": "2026-06-15", "venue_name": "New",
                "venue_city": "X", "latitude": 1.0, "longitude": 2.0,
                "venue_type": "library", "event_type": "other", "person_name": "P",
                "people_reached": 5, "permalink": "https://sib.example.edu/visits/3",
            },
        ],
    }
    monkeypatch.setattr(fed, "fetch_peer", lambda url: envelope2)
    fed.sync_peer(db, peer)

    rows = {
        r.remote_id: r
        for r in db.scalars(
            select(FederatedActivity).where(FederatedActivity.peer_id == peer.id)
        ).all()
    }
    assert set(rows) == {1, 3}  # id 2 pruned, id 3 added
    assert rows[1].people_reached == 99  # updated in place


def test_sync_peer_records_error(db, monkeypatch):
    peer = FederationPeer(feed_url="https://down.example.edu/feed", interval=FederationInterval.day)
    db.add(peer)
    db.commit()
    db.refresh(peer)

    def boom(url):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(fed, "fetch_peer", boom)
    fed.sync_peer(db, peer)  # must not raise
    assert peer.last_status == "error"
    assert "connection refused" in peer.last_error
    assert peer.last_synced_at is not None


# --- Consuming side: admin peer management ---

def test_admin_peer_crud(client, monkeypatch):
    register(client)
    monkeypatch.setattr(fed, "fetch_peer", lambda url: SAMPLE_ENVELOPE)

    r = client.post(
        "/api/admin/federation/peers",
        json={
            "feed_url": "https://sib.example.edu/api/federation/activities?token=secret",
            "interval": "hour",
        },
    )
    assert r.status_code == 201, r.text
    peer = r.json()
    assert peer["interval"] == "hour"
    assert "•••" in peer["feed_url"] and "secret" not in peer["feed_url"]  # masked
    assert peer["last_status"] == "ok"
    assert peer["activity_count"] == 2
    assert peer["label"] == "Sibling Lab"
    pid = peer["id"]

    assert len(client.get("/api/admin/federation/peers").json()) == 1

    upd = client.patch(f"/api/admin/federation/peers/{pid}", json={"enabled": False}).json()
    assert upd["enabled"] is False

    assert client.delete(f"/api/admin/federation/peers/{pid}").status_code == 204
    assert client.get("/api/admin/federation/peers").json() == []


def test_add_peer_rejects_bad_url(client):
    register(client)
    r = client.post("/api/admin/federation/peers", json={"feed_url": "not-a-url"})
    assert r.status_code == 400
