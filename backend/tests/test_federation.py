from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from sqlalchemy import select

from app.models import FederatedActivity, FederationInterval, FederationPeer
from app.services import federation as fed
from tests.conftest import create_venue, create_visit, register


def _seed_peer_with_activity(
    db,
    *,
    visit_date="2026-05-20",
    venue_type="high_school",
    event_type="workshop",
    audience_level="high_school",
    status="completed",
    people=15,
    lat=40.0,
    lon=-80.0,
    label="Sibling Lab",
):
    peer = FederationPeer(
        feed_url="https://sib.example.edu/api/federation/activities?token=t",
        interval=FederationInterval.day,
        label=label,
        enabled=True,
    )
    db.add(peer)
    db.commit()
    db.refresh(peer)
    db.add(
        FederatedActivity(
            peer_id=peer.id,
            remote_uid="sib-uid-1",
            remote_id=1,
            status=status,
            visit_date=date.fromisoformat(visit_date),
            venue_name="Sib School",
            venue_city="Elsewhere",
            latitude=lat,
            longitude=lon,
            venue_type=venue_type,
            event_type=event_type,
            audience_level=audience_level,
            person_name="Remote Person",
            people_reached=people,
            permalink="https://sib.example.edu/visits/1",
        )
    )
    db.commit()
    return peer

SAMPLE_ENVELOPE = {
    "feed_version": 1,
    "instance_name": "Sibling Lab",
    "instance_url": "https://sib.example.edu",
    "generated_at": "2026-07-01T00:00:00+00:00",
    "activities": [
        {
            "uid": "uid-1", "remote_id": 1, "status": "completed",
            "visit_date": "2026-05-01", "venue_name": "Sib School",
            "venue_city": "Elsewhere", "latitude": 40.0, "longitude": -80.0,
            "venue_type": "high_school", "event_type": "workshop",
            "audience_level": "high_school",
            "person_name": "Remote Person", "people_reached": 22,
            "permalink": "https://sib.example.edu/visits/1",
        },
        {
            "uid": "uid-2", "remote_id": 2, "status": "completed",
            "visit_date": "2026-06-01", "venue_name": "Sib Museum",
            "venue_city": "Elsewhere", "latitude": 41.0, "longitude": -81.0,
            "venue_type": "museum", "event_type": "lab_tour",
            "audience_level": "general_public",
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
    assert row["audience_level"] == "elementary"
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

    monkeypatch.setattr(fed, "fetch_peer", lambda url, **kwargs: SAMPLE_ENVELOPE)
    fed.sync_peer(db, peer, force_full=True)

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
                "uid": "uid-3", "remote_id": 3, "status": "completed",
                "visit_date": "2026-06-15", "venue_name": "New",
                "venue_city": "X", "latitude": 1.0, "longitude": 2.0,
                "venue_type": "library", "event_type": "other", "person_name": "P",
                "people_reached": 5, "permalink": "https://sib.example.edu/visits/3",
            },
        ],
    }
    monkeypatch.setattr(fed, "fetch_peer", lambda url, **kwargs: envelope2)
    fed.sync_peer(db, peer, force_full=True)

    rows = {
        r.remote_id: r
        for r in db.scalars(
            select(FederatedActivity).where(FederatedActivity.peer_id == peer.id)
        ).all()
    }
    assert set(rows) == {1, 3}  # id 2 pruned, id 3 added
    assert rows[1].people_reached == 99  # updated in place


def test_fetch_page_preserves_token_query():
    """The paged fetch must MERGE its params into the feed URL, keeping the
    token already in the query string (httpx's params= would drop it → 403)."""
    from datetime import datetime, timezone

    url = fed._with_params(
        "https://sib.example.edu/api/federation/activities?token=SECRET",
        {"status": "all", "limit": 1000, "offset": 0},
    )
    assert "token=SECRET" in url
    assert "status=all" in url and "offset=0" in url

    # updated_since is appended alongside, token still intact.
    since = datetime(2026, 1, 1, tzinfo=timezone.utc)
    url2 = fed._with_params(
        "https://sib.example.edu/feed?token=abc",
        {"updated_since": since.isoformat()},
    )
    assert "token=abc" in url2 and "updated_since=" in url2


def test_backoff_delay_grows_with_failures():
    peer = FederationPeer(
        feed_url="x", interval=FederationInterval.hour, enabled=True
    )
    peer.consecutive_failures = 0
    assert fed.effective_delay(peer) == timedelta(hours=1)
    peer.consecutive_failures = 1
    assert fed.effective_delay(peer) == timedelta(hours=2)
    peer.consecutive_failures = 3
    assert fed.effective_delay(peer) == timedelta(hours=8)
    # Doubling is clamped at 2**6 (six failures worth).
    peer.consecutive_failures = 99
    assert fed.effective_delay(peer) == timedelta(hours=64)
    # And a slow-interval peer's backoff is capped at BACKOFF_CAP.
    weekly = FederationPeer(feed_url="x", interval=FederationInterval.week, enabled=True)
    weekly.consecutive_failures = 6  # 64 weeks, well past the cap
    assert fed.effective_delay(weekly) == fed.BACKOFF_CAP


def test_incremental_sync_does_not_prune(db, monkeypatch):
    """A non-full (incremental) sync keeps rows the delta didn't mention."""
    peer = FederationPeer(
        feed_url="https://sib.example.edu/api/federation/activities?token=t",
        interval=FederationInterval.day,
    )
    db.add(peer)
    db.commit()
    db.refresh(peer)

    monkeypatch.setattr(fed, "fetch_peer", lambda url, **kwargs: SAMPLE_ENVELOPE)
    fed.sync_peer(db, peer, force_full=True)
    assert peer.activity_count == 2
    assert peer.last_full_synced_at is not None
    assert peer.last_updated_at is not None  # high-water mark advanced

    # An incremental delta carrying only uid-1 (updated) must NOT prune uid-2.
    delta = {
        **SAMPLE_ENVELOPE,
        "generated_at": "2026-07-02T00:00:00+00:00",
        "activities": [{**SAMPLE_ENVELOPE["activities"][0], "people_reached": 77}],
    }
    captured = {}

    def fake_fetch(url, *, updated_since=None):
        captured["updated_since"] = updated_since
        return delta

    monkeypatch.setattr(fed, "fetch_peer", fake_fetch)
    # now is close to last_full_synced_at, so this stays incremental (no force).
    fed.sync_peer(db, peer)

    assert captured["updated_since"] is not None  # passed the cursor along
    rows = {
        r.remote_id: r
        for r in db.scalars(
            select(FederatedActivity).where(FederatedActivity.peer_id == peer.id)
        ).all()
    }
    assert set(rows) == {1, 2}  # uid-2 survived the incremental sync
    assert rows[1].people_reached == 77  # uid-1 updated in place


def test_full_reconcile_after_interval_prunes(db, monkeypatch):
    """Once FULL_RECONCILE_INTERVAL passes, a plain sync goes full and prunes."""
    peer = FederationPeer(
        feed_url="https://sib.example.edu/api/federation/activities?token=t",
        interval=FederationInterval.day,
    )
    db.add(peer)
    db.commit()
    db.refresh(peer)

    t0 = datetime(2026, 7, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(fed, "fetch_peer", lambda url, **kwargs: SAMPLE_ENVELOPE)
    fed.sync_peer(db, peer, now=t0, force_full=True)
    assert peer.activity_count == 2

    # A day+ later, an unforced sync should reconcile fully and prune uid-2.
    only_one = {
        **SAMPLE_ENVELOPE,
        "activities": [SAMPLE_ENVELOPE["activities"][0]],
    }
    monkeypatch.setattr(fed, "fetch_peer", lambda url, **kwargs: only_one)
    fed.sync_peer(db, peer, now=t0 + timedelta(days=1, minutes=1))

    rows = db.scalars(
        select(FederatedActivity).where(FederatedActivity.peer_id == peer.id)
    ).all()
    assert {r.remote_id for r in rows} == {1}  # uid-2 pruned by full reconcile


def test_sync_peer_records_error(db, monkeypatch):
    peer = FederationPeer(feed_url="https://down.example.edu/feed", interval=FederationInterval.day)
    db.add(peer)
    db.commit()
    db.refresh(peer)

    def boom(url, **kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(fed, "fetch_peer", boom)
    fed.sync_peer(db, peer)  # must not raise
    assert peer.last_status == "error"
    assert "connection refused" in peer.last_error
    assert peer.last_synced_at is not None
    assert peer.consecutive_failures == 1
    fed.sync_peer(db, peer)  # a second failure backs off further
    assert peer.consecutive_failures == 2


# --- Consuming side: admin peer management ---

def test_admin_peer_crud(client, monkeypatch):
    register(client)
    monkeypatch.setattr(fed, "fetch_peer", lambda url, **kwargs: SAMPLE_ENVELOPE)

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


# --- Merge into list / map / stats / public ---

def test_list_merges_federated(client, db):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], title="Local one")
    _seed_peer_with_activity(db)

    data = client.get("/api/visits").json()
    sources = {it["source"] for it in data["items"]}
    assert "local" in sources and "Sibling Lab" in sources

    fed_row = next(it for it in data["items"] if it["source"] == "Sibling Lab")
    assert fed_row["external_url"] == "https://sib.example.edu/visits/1"
    assert fed_row["id"] is None
    assert fed_row["venue"]["name"] == "Sib School"
    assert fed_row["audience_level"] == "high_school"  # audience crosses the feed

    excluded = client.get("/api/visits", params={"include_federated": False}).json()
    assert all(it["source"] == "local" for it in excluded["items"])

    # A filter the feed can't satisfy (mine-only / author) drops federated rows.
    me = client.get("/api/auth/me").json()
    mine = client.get("/api/visits", params={"author_id": me["id"]}).json()
    assert all(it["source"] == "local" for it in mine["items"])


def test_list_sources_lists_local_and_peers(client, db):
    register(client)
    # No peers yet → only the local source.
    assert client.get("/api/visits/sources").json() == [
        {"value": "local", "label": "Local"}
    ]
    peer = _seed_peer_with_activity(db, label="Sibling Lab")
    peer.activity_count = 1
    db.commit()
    sources = client.get("/api/visits/sources").json()
    assert {"value": "local", "label": "Local"} in sources
    assert {"value": str(peer.id), "label": "Sibling Lab"} in sources


def test_list_filter_by_source(client, db):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], title="Local one")
    peer = _seed_peer_with_activity(db)

    # source=local → only local rows.
    local_only = client.get("/api/visits", params={"source": "local"}).json()
    assert all(it["source"] == "local" for it in local_only["items"])

    # source=<peer id> → only that peer's rows.
    peer_only = client.get("/api/visits", params={"source": str(peer.id)}).json()
    assert peer_only["items"]
    assert all(it["source"] == "Sibling Lab" for it in peer_only["items"])


def test_stats_summary_includes_federated(client, db):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], people_reached=30)
    _seed_peer_with_activity(db, people=15)

    incl = client.get("/api/stats/summary").json()
    excl = client.get("/api/stats/summary", params={"include_federated": False}).json()
    assert incl["total_visits"] == excl["total_visits"] + 1
    assert incl["total_people_reached"] == excl["total_people_reached"] + 15


def test_stats_audience_breakdown_includes_federated(client, db):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], audience_level="elementary", people_reached=30)
    _seed_peer_with_activity(db, audience_level="high_school", people=15)

    incl = {
        r["key"]: r
        for r in client.get(
            "/api/stats/breakdown", params={"by": "audience_level"}
        ).json()
    }
    assert "high_school" in incl  # sibling audience folds in
    excl = {
        r["key"]
        for r in client.get(
            "/api/stats/breakdown",
            params={"by": "audience_level", "include_federated": False},
        ).json()
    }
    assert "high_school" not in excl  # toggled off → local only


def test_map_federated_layer(client, db):
    register(client)
    _seed_peer_with_activity(db, lat=40.0, lon=-80.0)
    pts = client.get("/api/map/federated").json()
    assert len(pts) == 1
    assert pts[0]["source_label"] == "Sibling Lab"
    assert pts[0]["permalink"] == "https://sib.example.edu/visits/1"


def test_public_impact_federated_toggle(client, db, make_client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], people_reached=40)
    client.patch("/api/admin/settings", json={"public_page": True})
    _seed_peer_with_activity(db, people=15)

    anon = make_client()
    base = anon.get("/api/public/impact").json()
    withfed = anon.get("/api/public/impact", params={"include_federated": True}).json()
    assert base["total_visits"] == 1  # own instance only by default
    assert withfed["total_visits"] == 2  # + 1 sibling activity
    assert withfed["total_people_reached"] == base["total_people_reached"] + 15
    # Sibling names never leak into the public recent list.
    assert all("Remote Person" not in str(r) for r in withfed["recent"])
