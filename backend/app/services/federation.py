# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""Consuming siblings: fetch a peer's published feed and cache it locally.

Scheduled syncs are incremental (only rows changed since a high-water mark) and
paged, so arbitrarily large peers sync fully and cheaply. A periodic full
reconcile (and every manual sync) re-fetches everything and prunes rows the peer
no longer publishes — that's how remote deletions/unpublishes propagate. Failing
peers back off exponentially (never more often than their interval).
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import FederatedActivity, FederationInterval, FederationPeer

USER_AGENT = "DOCENT-outreach-tracker/0.1 (+https://github.com/lawrenceleejr/docent)"

INTERVAL_DELTA = {
    FederationInterval.hour: timedelta(hours=1),
    FederationInterval.day: timedelta(days=1),
    FederationInterval.week: timedelta(weeks=1),
}

FETCH_TIMEOUT = 30
PAGE_SIZE = 1000
MAX_PAGES = 50  # safety backstop: at most 50k rows/sync
# Re-fetch everything (and prune) at least this often, to catch remote deletions.
FULL_RECONCILE_INTERVAL = timedelta(days=1)
# Overlap the incremental cursor slightly so a row updated during the previous
# fetch isn't skipped; dedup by uid makes the re-fetch harmless.
CURSOR_OVERLAP = timedelta(minutes=1)
BACKOFF_CAP = timedelta(days=7)


def interval_delta(interval: FederationInterval) -> timedelta:
    return INTERVAL_DELTA[interval]


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def effective_delay(peer: FederationPeer) -> timedelta:
    """Normal interval when healthy; exponential backoff when failing (always
    >= the interval, capped)."""
    base = interval_delta(peer.interval)
    failures = peer.consecutive_failures or 0
    if failures > 0:
        backoff = base * (2 ** min(failures, 6))
        return min(backoff, BACKOFF_CAP)
    return base


def due(peer: FederationPeer, now: datetime) -> bool:
    if not peer.enabled:
        return False
    last = _aware(peer.last_synced_at)
    if last is None:
        return True
    return now - last >= effective_delay(peer)


def due_peers(db: Session, now: datetime) -> list[FederationPeer]:
    peers = db.scalars(select(FederationPeer).where(FederationPeer.enabled.is_(True))).all()
    return [p for p in peers if due(p, now)]


def _with_params(feed_url: str, extra: dict[str, Any]) -> str:
    """Merge `extra` query params INTO the feed URL, preserving its existing
    query string (which carries the auth token). httpx's `params=` argument
    REPLACES the query string rather than merging, so we must build the URL
    ourselves or the token is dropped and the peer answers 403."""
    parts = urlsplit(feed_url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    query.extend((k, str(v)) for k, v in extra.items())
    return urlunsplit(parts._replace(query=urlencode(query)))


def fetch_page(
    feed_url: str, *, updated_since: datetime | None, offset: int
) -> dict[str, Any]:
    """GET one page of a peer's feed (status=all). Raises httpx.HTTPError."""
    verify = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE") or True
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    params: dict[str, Any] = {"status": "all", "limit": PAGE_SIZE, "offset": offset}
    if updated_since is not None:
        params["updated_since"] = updated_since.isoformat()
    url = _with_params(feed_url, params)
    with httpx.Client(
        verify=verify, trust_env=True, timeout=FETCH_TIMEOUT, headers=headers
    ) as client:
        response = client.get(url)
    response.raise_for_status()
    return response.json()


def fetch_peer(feed_url: str, *, updated_since: datetime | None = None) -> dict[str, Any]:
    """Page through a peer's feed, returning a single merged envelope."""
    activities: list[dict[str, Any]] = []
    envelope: dict[str, Any] = {}
    for page in range(MAX_PAGES):
        envelope = fetch_page(feed_url, updated_since=updated_since, offset=page * PAGE_SIZE)
        batch = envelope.get("activities") or []
        activities.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
    envelope["activities"] = activities
    return envelope


def _coerce_row(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Validate/normalize one feed activity; None if unusable."""
    visit_date = raw.get("visit_date")
    remote_id = raw.get("remote_id")
    uid = raw.get("uid") or (str(remote_id) if remote_id is not None else None)
    if not uid or not visit_date:
        return None
    try:
        remote_id = int(remote_id) if remote_id is not None else 0
    except (TypeError, ValueError):
        remote_id = 0
    status = raw.get("status") or "completed"
    if status not in ("completed", "planned"):
        status = "completed"
    return {
        "remote_uid": str(uid),
        "remote_id": remote_id,
        "status": status,
        "visit_date": visit_date,
        "venue_name": raw.get("venue_name"),
        "venue_city": raw.get("venue_city"),
        "latitude": raw.get("latitude"),
        "longitude": raw.get("longitude"),
        "venue_type": raw.get("venue_type"),
        "event_type": raw.get("event_type"),
        "audience_level": raw.get("audience_level"),
        "person_name": raw.get("person_name"),
        "people_reached": raw.get("people_reached") or 0,
        "permalink": raw.get("permalink"),
    }


def upsert_activities(
    db: Session, peer: FederationPeer, envelope: dict[str, Any], *, prune: bool
) -> None:
    """Upsert the feed's rows keyed by (peer, remote_uid). When `prune`, also
    delete cached rows the peer no longer publishes (full-reconcile only)."""
    parsed = [r for r in (_coerce_row(x) for x in envelope.get("activities") or []) if r]
    existing = {
        a.remote_uid: a
        for a in db.scalars(
            select(FederatedActivity).where(FederatedActivity.peer_id == peer.id)
        ).all()
    }
    now = datetime.now(timezone.utc)
    seen: set[str] = set()
    for row in parsed:
        seen.add(row["remote_uid"])
        current = existing.get(row["remote_uid"])
        if current is None:
            db.add(FederatedActivity(peer_id=peer.id, fetched_at=now, **row))
        else:
            for key, value in row.items():
                setattr(current, key, value)
            current.fetched_at = now
    if prune:
        stale = [uid for uid in existing if uid not in seen]
        if stale:
            db.execute(
                delete(FederatedActivity).where(
                    FederatedActivity.peer_id == peer.id,
                    FederatedActivity.remote_uid.in_(stale),
                )
            )


def sync_peer(
    db: Session, peer: FederationPeer, now: datetime | None = None, *, force_full: bool = False
) -> None:
    """Fetch a peer and refresh its cache, recording status/backoff state.

    Never raises for network/parse errors — they're recorded on the peer."""
    now = now or datetime.now(timezone.utc)
    last_full = _aware(peer.last_full_synced_at)
    do_full = (
        force_full
        or last_full is None
        or (now - last_full) >= FULL_RECONCILE_INTERVAL
    )
    updated_since = None if do_full else _aware(peer.last_updated_at)
    try:
        envelope = fetch_peer(peer.feed_url, updated_since=updated_since)
        upsert_activities(db, peer, envelope, prune=do_full)
        # The session has autoflush disabled, so flush the upserted rows before
        # recomputing activity_count below (otherwise the count sees zero).
        db.flush()

        # Advance the high-water mark to the server's feed timestamp (server
        # clock, consistent with row updated_at), with a small overlap.
        generated = envelope.get("generated_at")
        cursor: datetime | None = None
        if generated:
            try:
                cursor = datetime.fromisoformat(generated) - CURSOR_OVERLAP
            except ValueError:
                cursor = None
        if cursor is not None:
            peer.last_updated_at = cursor
        if do_full:
            peer.last_full_synced_at = now

        if not peer.label:
            name = (envelope.get("instance_name") or "").strip()
            if name:
                peer.label = name[:255]
        peer.activity_count = db.scalar(
            select(func.count())
            .select_from(FederatedActivity)
            .where(FederatedActivity.peer_id == peer.id)
        ) or 0
        peer.last_status = "ok"
        peer.last_error = None
        peer.consecutive_failures = 0
    except Exception as exc:  # noqa: BLE001 — record, don't crash the loop
        peer.last_status = "error"
        peer.last_error = str(exc)[:2000]
        peer.consecutive_failures = (peer.consecutive_failures or 0) + 1
    peer.last_synced_at = now
    db.commit()


def next_sync_at(peer: FederationPeer) -> datetime | None:
    """When this peer is next eligible to sync (None if never synced → due now)."""
    last = _aware(peer.last_synced_at)
    if last is None:
        return None
    return last + effective_delay(peer)


def federated_query(
    db: Session,
    *,
    status: str = "completed",
    date_from=None,
    date_to=None,
    venue_type: str | None = None,
    event_type: str | None = None,
):
    """Cached federated activities matching the filters. Returns
    (FederatedActivity, peer_label) pairs for enabled peers."""
    query = (
        select(FederatedActivity, FederationPeer.label)
        .join(FederationPeer, FederatedActivity.peer_id == FederationPeer.id)
        .where(FederationPeer.enabled.is_(True), FederatedActivity.status == status)
    )
    if date_from:
        query = query.where(FederatedActivity.visit_date >= date_from)
    if date_to:
        query = query.where(FederatedActivity.visit_date <= date_to)
    if venue_type:
        query = query.where(FederatedActivity.venue_type == venue_type)
    if event_type:
        query = query.where(FederatedActivity.event_type == event_type)
    return db.execute(query).all()
