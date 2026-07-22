# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""Consuming siblings: fetch a peer's published feed and cache it locally.

Pure-ish, unit-testable pieces (`parse_feed`, `upsert_activities`, `due`) plus
the `fetch_peer`/`sync_peer` orchestration that talks to the network.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import FederatedActivity, FederationInterval, FederationPeer

USER_AGENT = "DOCENT-outreach-tracker/0.1 (+https://github.com/lawrenceleejr/docent)"

# How much time must pass before a peer is due for another sync.
INTERVAL_DELTA = {
    FederationInterval.hour: timedelta(hours=1),
    FederationInterval.day: timedelta(days=1),
    FederationInterval.week: timedelta(weeks=1),
}

# Defensive caps on what we accept from a peer.
FETCH_TIMEOUT = 30
MAX_ACTIVITIES = 5000


def interval_delta(interval: FederationInterval) -> timedelta:
    return INTERVAL_DELTA[interval]


def due(peer: FederationPeer, now: datetime) -> bool:
    """Whether an enabled peer should be synced at `now`."""
    if not peer.enabled:
        return False
    if peer.last_synced_at is None:
        return True
    last = peer.last_synced_at
    if last.tzinfo is None:  # stored naive → treat as UTC
        last = last.replace(tzinfo=timezone.utc)
    return now - last >= interval_delta(peer.interval)


def due_peers(db: Session, now: datetime) -> list[FederationPeer]:
    peers = db.scalars(select(FederationPeer).where(FederationPeer.enabled.is_(True))).all()
    return [p for p in peers if due(p, now)]


def fetch_peer(feed_url: str) -> dict[str, Any]:
    """GET a peer's feed envelope. Raises httpx.HTTPError on failure."""
    verify = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE") or True
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    with httpx.Client(
        verify=verify, trust_env=True, timeout=FETCH_TIMEOUT, headers=headers
    ) as client:
        response = client.get(feed_url)
    response.raise_for_status()
    return response.json()


def _coerce_row(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Validate/normalize one feed activity; None if it can't be used."""
    remote_id = raw.get("remote_id")
    visit_date = raw.get("visit_date")
    if remote_id is None or not visit_date:
        return None
    try:
        remote_id = int(remote_id)
    except (TypeError, ValueError):
        return None
    return {
        "remote_id": remote_id,
        "visit_date": visit_date,  # SQLAlchemy accepts ISO date strings on insert
        "venue_name": raw.get("venue_name"),
        "venue_city": raw.get("venue_city"),
        "latitude": raw.get("latitude"),
        "longitude": raw.get("longitude"),
        "venue_type": raw.get("venue_type"),
        "event_type": raw.get("event_type"),
        "person_name": raw.get("person_name"),
        "people_reached": raw.get("people_reached") or 0,
        "permalink": raw.get("permalink"),
    }


def upsert_activities(db: Session, peer: FederationPeer, envelope: dict[str, Any]) -> int:
    """Replace this peer's cached activities with the feed's contents.

    Dedup key is (peer_id, remote_id): existing rows are updated, new rows
    inserted, and rows no longer present in the feed are pruned. Returns the
    resulting activity count.
    """
    raw_rows = (envelope.get("activities") or [])[:MAX_ACTIVITIES]
    parsed = [r for r in (_coerce_row(x) for x in raw_rows) if r is not None]

    existing = {
        a.remote_id: a
        for a in db.scalars(
            select(FederatedActivity).where(FederatedActivity.peer_id == peer.id)
        ).all()
    }
    seen: set[int] = set()
    now = datetime.now(timezone.utc)
    for row in parsed:
        seen.add(row["remote_id"])
        current = existing.get(row["remote_id"])
        if current is None:
            db.add(FederatedActivity(peer_id=peer.id, fetched_at=now, **row))
        else:
            for key, value in row.items():
                setattr(current, key, value)
            current.fetched_at = now

    stale = [rid for rid in existing if rid not in seen]
    if stale:
        db.execute(
            delete(FederatedActivity).where(
                FederatedActivity.peer_id == peer.id,
                FederatedActivity.remote_id.in_(stale),
            )
        )
    return len(seen)


def sync_peer(db: Session, peer: FederationPeer, now: datetime | None = None) -> None:
    """Fetch a peer and refresh its cached activities, recording status.

    Never raises for network/parse errors — they are recorded on the peer so
    the scheduler and admin UI can surface them.
    """
    now = now or datetime.now(timezone.utc)
    try:
        envelope = fetch_peer(peer.feed_url)
        count = upsert_activities(db, peer, envelope)
        # Adopt the peer's self-reported name if the admin didn't set a label.
        if not peer.label:
            name = (envelope.get("instance_name") or "").strip()
            if name:
                peer.label = name[:255]
        peer.activity_count = count
        peer.last_status = "ok"
        peer.last_error = None
    except Exception as exc:  # noqa: BLE001 — record, don't crash the loop
        peer.last_status = "error"
        peer.last_error = str(exc)[:2000]
    peer.last_synced_at = now
    db.commit()


def federated_query(
    db: Session,
    *,
    date_from=None,
    date_to=None,
    venue_type: str | None = None,
    event_type: str | None = None,
):
    """Cached federated activities matching the shared filters (feed-only
    fields). Returns (FederatedActivity, peer_label) pairs."""
    query = select(FederatedActivity, FederationPeer.label).join(
        FederationPeer, FederatedActivity.peer_id == FederationPeer.id
    ).where(FederationPeer.enabled.is_(True))
    if date_from:
        query = query.where(FederatedActivity.visit_date >= date_from)
    if date_to:
        query = query.where(FederatedActivity.visit_date <= date_to)
    if venue_type:
        query = query.where(FederatedActivity.venue_type == venue_type)
    if event_type:
        query = query.where(FederatedActivity.event_type == event_type)
    return db.execute(query).all()
