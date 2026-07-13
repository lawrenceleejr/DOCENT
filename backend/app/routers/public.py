# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""Unauthenticated, read-only "impact page" data.

Served only when an admin has switched the public page on. Deliberately
aggregate/report-safe: totals, time series, venue-type breakdown, and a short
list of recent activities with factual fields only — never notes, ratings,
host contacts, or communicator identities.
"""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import Integer, cast, func, select

from app.deps import DbSession
from app.models import Venue, Visit, VisitStatus
from app.schemas import BreakdownRow, PublicActivity, PublicImpact, TimeseriesPoint
from app.services.settings import effective_site_name, public_page_enabled

router = APIRouter(prefix="/api/public", tags=["public"])

RECENT_LIMIT = 12


@router.get("/impact", response_model=PublicImpact)
def public_impact(db: DbSession) -> PublicImpact:
    if not public_page_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Public page is not enabled"
        )

    completed = Visit.status == VisitStatus.completed

    totals = db.execute(
        select(
            func.count(Visit.id),
            func.coalesce(func.sum(Visit.people_reached), 0),
            func.count(func.distinct(Visit.venue_id)),
            func.count(func.distinct(Visit.author_id)),
        ).where(completed)
    ).one()

    half = cast(func.floor((func.extract("month", Visit.visit_date) - 1) / 6) + 1, Integer)
    period = func.concat(func.to_char(Visit.visit_date, "YYYY"), " H", half)
    series = db.execute(
        select(
            period.label("period"),
            func.count(Visit.id),
            func.coalesce(func.sum(Visit.people_reached), 0),
        )
        .where(completed)
        .group_by("period")
        .order_by("period")
    ).all()

    breakdown = db.execute(
        select(
            Venue.venue_type,
            func.count(Visit.id),
            func.coalesce(func.sum(Visit.people_reached), 0),
        )
        .join(Visit.venue)
        .where(completed)
        .group_by(Venue.venue_type)
        .order_by(func.count(Visit.id).desc())
    ).all()

    recent = db.execute(
        select(Visit.visit_date, Visit.title, Visit.event_type, Venue.name, Venue.city, Visit.people_reached)
        .join(Visit.venue)
        .where(completed)
        .order_by(Visit.visit_date.desc(), Visit.id.desc())
        .limit(RECENT_LIMIT)
    ).all()

    return PublicImpact(
        site_name=effective_site_name(db) or None,
        total_visits=totals[0],
        total_people_reached=totals[1],
        distinct_venues=totals[2],
        active_communicators=totals[3],
        timeseries=[
            TimeseriesPoint(period=r[0], visits=r[1], people_reached=r[2]) for r in series
        ],
        by_venue_type=[
            BreakdownRow(key=r[0].value, visits=r[1], people_reached=r[2]) for r in breakdown
        ],
        recent=[
            PublicActivity(
                visit_date=r[0],
                title=r[1],
                event_type=r[2],
                venue_name=r[3],
                venue_city=r[4],
                people_reached=r[5],
            )
            for r in recent
        ],
    )
