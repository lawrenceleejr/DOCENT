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
from app.services.federation import federated_query
from app.services.settings import effective_site_name, public_page_enabled

router = APIRouter(prefix="/api/public", tags=["public"])

RECENT_LIMIT = 12


def _half_year_period(d) -> str:
    return f"{d.year} H{1 if d.month <= 6 else 2}"


@router.get("/impact", response_model=PublicImpact)
def public_impact(db: DbSession, include_federated: bool = False) -> PublicImpact:
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

    total_visits, total_people, distinct_venues, active_communicators = (
        totals[0], totals[1], totals[2], totals[3]
    )
    series_buckets: dict[str, list[int]] = {r[0]: [r[1], r[2]] for r in series}
    vtype_buckets: dict[str, list[int]] = {r[0].value: [r[1], r[2]] for r in breakdown}

    # Optionally fold in the wider federation network — aggregate numbers only,
    # NEVER sibling names (the recent list below stays local and name-free).
    if include_federated:
        fed_rows = [a for a, _label in federated_query(db)]
        if fed_rows:
            total_visits += len(fed_rows)
            total_people += sum(a.people_reached for a in fed_rows)
            distinct_venues += len({(a.venue_name, a.venue_city) for a in fed_rows})
            active_communicators += len({a.person_name for a in fed_rows if a.person_name})
            for a in fed_rows:
                sb = series_buckets.setdefault(_half_year_period(a.visit_date), [0, 0])
                sb[0] += 1
                sb[1] += a.people_reached
                if a.venue_type:
                    vb = vtype_buckets.setdefault(a.venue_type, [0, 0])
                    vb[0] += 1
                    vb[1] += a.people_reached

    return PublicImpact(
        site_name=effective_site_name(db) or None,
        total_visits=total_visits,
        total_people_reached=total_people,
        distinct_venues=distinct_venues,
        active_communicators=active_communicators,
        timeseries=[
            TimeseriesPoint(period=p, visits=v, people_reached=pr)
            for p, (v, pr) in sorted(series_buckets.items())
        ],
        by_venue_type=[
            BreakdownRow(key=k, visits=v, people_reached=pr)
            for k, (v, pr) in sorted(vtype_buckets.items(), key=lambda kv: kv[1][0], reverse=True)
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
