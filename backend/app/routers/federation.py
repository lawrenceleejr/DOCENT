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
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.deps import DbSession
from app.models import Visit, VisitStatus
from app.schemas import FederatedActivityOut, FederationFeed
from app.services.settings import (
    effective_site_name,
    effective_site_url,
    federation_publish_enabled,
    get_federation_token,
)

router = APIRouter(prefix="/api/federation", tags=["federation"])

FEED_LIMIT = 5000


@router.get("/activities", response_model=FederationFeed)
def federation_feed(
    request: Request,
    db: DbSession,
    token: str = Query(default=""),
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

    base = (effective_site_url(db) or str(request.base_url)).rstrip("/")

    rows = db.scalars(
        select(Visit)
        .where(Visit.status == VisitStatus.completed)
        .options(joinedload(Visit.author), joinedload(Visit.venue))
        .order_by(Visit.visit_date.desc(), Visit.id.desc())
        .limit(FEED_LIMIT)
    ).all()

    activities = [
        FederatedActivityOut(
            remote_id=v.id,
            visit_date=v.visit_date,
            venue_name=v.venue.name if v.venue else None,
            venue_city=v.venue.city if v.venue else None,
            latitude=v.venue.latitude if v.venue else None,
            longitude=v.venue.longitude if v.venue else None,
            venue_type=v.venue.venue_type.value if v.venue else None,
            event_type=v.event_type.value if v.event_type else None,
            audience_level=v.audience_level.value if v.audience_level else None,
            person_name=v.author.name if v.author else None,
            people_reached=v.people_reached,
            permalink=f"{base}/visits/{v.id}",
        )
        for v in rows
    ]

    return FederationFeed(
        instance_name=effective_site_name(db) or None,
        instance_url=(effective_site_url(db) or None),
        generated_at=datetime.now(timezone.utc),
        activities=activities,
    )
