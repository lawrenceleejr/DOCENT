# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""The token-authenticated activities feed this instance publishes to siblings.

Deliberately limited: date, place (+coords/type), the person, event type,
people reached, and a deep-link back here. NEVER private fields (descriptions,
reflections, ratings, host contact details, notes). A viewer only sees full
detail by following the deep-link and authenticating on this instance.

Reachable with a plain `curl` (no cookie) — the token in the query string is the
only credential, so serve this over HTTPS.
"""
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.deps import DbSession
from app.models import User, Visit, VisitStatus
from app.schemas import Contributor, FederatedActivityOut, FederationFeed
from app.services.settings import (
    effective_site_name,
    effective_site_url,
    federation_publish_enabled,
    federation_publish_planned_enabled,
    get_federation_token,
)

router = APIRouter(prefix="/api/federation", tags=["federation"])

# Bumped when the feed's shape changes so consumers can adapt.
# Bumped to 2 when `contributors` (per-person ORCIDs) was added to each activity,
# and to 3 when `tags` were added so subscribers can pull a tagged subset (#31).
FEED_VERSION = 3
DEFAULT_LIMIT = 1000
MAX_LIMIT = 5000


def _split_presenters(text: str | None) -> list[str]:
    """Split the free-text co-presenter field into individual names."""
    if not text:
        return []
    return [p.strip() for p in re.split(r"[;,\n]", text) if p.strip()]


def _build_contributors(v: Visit, linked: dict[int, User]) -> list[Contributor]:
    """Everyone associated with the event — lead first, then linked co-presenters
    (with ORCIDs), then any free-text names — deduped by name (#9)."""
    out: list[Contributor] = []
    seen: set[str] = set()

    def add(name: str | None, orcid: str | None) -> None:
        if not name or name.lower() in seen:
            return
        seen.add(name.lower())
        out.append(Contributor(name=name, orcid=orcid))

    if v.author:
        add(v.author.name, v.author.orcid)
    for uid in v.co_presenter_user_ids or []:
        u = linked.get(uid)
        if u:
            add(u.name, u.orcid)
    for name in _split_presenters(v.additional_presenters):
        add(name, None)
    return out


@router.get("/activities", response_model=FederationFeed)
def federation_feed(
    request: Request,
    db: DbSession,
    token: str = Query(default=""),
    status_filter: Literal["completed", "planned", "all"] = Query(
        default="completed", alias="status"
    ),
    updated_since: datetime | None = None,
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> FederationFeed:
    if not federation_publish_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Federation feed is not enabled",
        )
    expected = get_federation_token(db)
    if not expected or token != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid federation token"
        )

    # Completed is always served; planned only if the admin opted in.
    allowed = {VisitStatus.completed}
    if federation_publish_planned_enabled(db):
        allowed.add(VisitStatus.planned)
    requested = {
        "completed": {VisitStatus.completed},
        "planned": {VisitStatus.planned},
        "all": {VisitStatus.completed, VisitStatus.planned},
    }[status_filter]
    want = requested & allowed

    base = (effective_site_url(db) or str(request.base_url)).rstrip("/")

    activities: list[FederatedActivityOut] = []
    if want:
        # Ordered by (updated_at, id) so consumers can page and pull
        # incrementally via `updated_since` (the high-water mark).
        query = (
            select(Visit)
            .where(Visit.status.in_(want))
            .options(joinedload(Visit.author), joinedload(Visit.venue))
            .order_by(Visit.updated_at.asc(), Visit.id.asc())
            .offset(offset)
            .limit(limit)
        )
        if updated_since is not None:
            query = query.where(Visit.updated_at > updated_since)
        visits = db.scalars(query).all()
        # Batch-load the linked co-presenters across this page for their ORCIDs.
        copres_ids = {uid for v in visits for uid in (v.co_presenter_user_ids or [])}
        linked = (
            {u.id: u for u in db.scalars(select(User).where(User.id.in_(copres_ids)))}
            if copres_ids
            else {}
        )
        activities = [
            FederatedActivityOut(
                uid=v.uid,
                remote_id=v.id,
                status=v.status.value,
                visit_date=v.visit_date,
                venue_name=v.venue.name if v.venue else None,
                venue_city=v.venue.city if v.venue else None,
                latitude=v.venue.latitude if v.venue else None,
                longitude=v.venue.longitude if v.venue else None,
                venue_type=v.venue.venue_type.value if v.venue else None,
                event_type=v.event_type.value if v.event_type else None,
                audience_level=v.audience_level.value if v.audience_level else None,
                person_name=v.author.name if v.author else None,
                contributors=_build_contributors(v, linked),
                tags=list(v.tags or []),
                people_reached=v.people_reached,
                permalink=f"{base}/visits/{v.id}",
            )
            for v in visits
        ]

    return FederationFeed(
        feed_version=FEED_VERSION,
        instance_name=effective_site_name(db) or None,
        instance_url=(effective_site_url(db) or None),
        generated_at=datetime.now(timezone.utc),
        activities=activities,
    )
