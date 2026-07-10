from datetime import date
from enum import Enum

from fastapi import APIRouter, Query
from sqlalchemy import Select, func, select

from app.deps import CurrentUser, DbSession
from app.models import User, Venue, Visit
from app.schemas import (
    BreakdownRow,
    LeaderboardRow,
    StatsSummary,
    TimeseriesPoint,
    TopVenueRow,
    UserBrief,
    VenueBrief,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])


class BreakdownBy(str, Enum):
    venue_type = "venue_type"
    event_type = "event_type"
    audience_level = "audience_level"


def _date_filtered(query: Select, date_from: date | None, date_to: date | None) -> Select:
    if date_from:
        query = query.where(Visit.visit_date >= date_from)
    if date_to:
        query = query.where(Visit.visit_date <= date_to)
    return query


@router.get("/summary", response_model=StatsSummary)
def summary(
    db: DbSession,
    _user: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
):
    row = db.execute(
        _date_filtered(
            select(
                func.count(Visit.id),
                func.coalesce(func.sum(Visit.people_reached), 0),
                func.count(func.distinct(Visit.venue_id)),
                func.count(func.distinct(Visit.author_id)),
                func.avg(Visit.rating),
            ),
            date_from,
            date_to,
        )
    ).one()
    return StatsSummary(
        total_visits=row[0],
        total_people_reached=row[1],
        distinct_venues=row[2],
        active_researchers=row[3],
        avg_rating=round(float(row[4]), 2) if row[4] is not None else None,
    )


@router.get("/timeseries", response_model=list[TimeseriesPoint])
def timeseries(
    db: DbSession,
    _user: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
):
    period = func.to_char(func.date_trunc("month", Visit.visit_date), "YYYY-MM")
    rows = db.execute(
        _date_filtered(
            select(
                period.label("period"),
                func.count(Visit.id),
                func.coalesce(func.sum(Visit.people_reached), 0),
            ),
            date_from,
            date_to,
        )
        .group_by("period")
        .order_by("period")
    ).all()
    return [
        TimeseriesPoint(period=r[0], visits=r[1], people_reached=r[2]) for r in rows
    ]


@router.get("/breakdown", response_model=list[BreakdownRow])
def breakdown(
    db: DbSession,
    _user: CurrentUser,
    by: BreakdownBy = Query(default=BreakdownBy.venue_type),
    date_from: date | None = None,
    date_to: date | None = None,
):
    if by is BreakdownBy.venue_type:
        key = Venue.venue_type
        query = select(
            key, func.count(Visit.id), func.coalesce(func.sum(Visit.people_reached), 0)
        ).join(Visit.venue)
    else:
        key = Visit.event_type if by is BreakdownBy.event_type else Visit.audience_level
        query = select(
            key, func.count(Visit.id), func.coalesce(func.sum(Visit.people_reached), 0)
        )
    rows = db.execute(
        _date_filtered(query, date_from, date_to)
        .group_by(key)
        .order_by(func.count(Visit.id).desc())
    ).all()
    return [BreakdownRow(key=r[0].value, visits=r[1], people_reached=r[2]) for r in rows]


@router.get("/top-venues", response_model=list[TopVenueRow])
def top_venues(
    db: DbSession,
    _user: CurrentUser,
    limit: int = Query(default=10, ge=1, le=50),
    date_from: date | None = None,
    date_to: date | None = None,
):
    rows = db.execute(
        _date_filtered(
            select(
                Venue,
                func.count(Visit.id),
                func.coalesce(func.sum(Visit.people_reached), 0),
            ).join(Visit.venue),
            date_from,
            date_to,
        )
        .group_by(Venue.id)
        .order_by(func.count(Visit.id).desc(), func.sum(Visit.people_reached).desc())
        .limit(limit)
    ).all()
    return [
        TopVenueRow(venue=VenueBrief.model_validate(r[0]), visits=r[1], people_reached=r[2])
        for r in rows
    ]


@router.get("/leaderboard", response_model=list[LeaderboardRow])
def leaderboard(
    db: DbSession,
    _user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=100),
    date_from: date | None = None,
    date_to: date | None = None,
):
    rows = db.execute(
        _date_filtered(
            select(
                User,
                func.count(Visit.id),
                func.coalesce(func.sum(Visit.people_reached), 0),
            ).join(Visit.author),
            date_from,
            date_to,
        )
        .group_by(User.id)
        .order_by(func.count(Visit.id).desc(), func.sum(Visit.people_reached).desc())
        .limit(limit)
    ).all()
    return [
        LeaderboardRow(user=UserBrief.model_validate(r[0]), visits=r[1], people_reached=r[2])
        for r in rows
    ]
