from datetime import date
from enum import Enum

from fastapi import APIRouter, Query
from sqlalchemy import Integer, Select, cast, func, select

from app.deps import CurrentUser, DbSession
from app.models import (
    AudienceLevel,
    EventType,
    User,
    Venue,
    VenueType,
    Visit,
    VisitStatus,
)
from app.schemas import (
    BreakdownRow,
    LeaderboardRow,
    StatsSummary,
    TimeseriesPoint,
    TopVenueRow,
    UserBrief,
    VenueBrief,
    normalize_tags,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])


class BreakdownBy(str, Enum):
    venue_type = "venue_type"
    event_type = "event_type"
    audience_level = "audience_level"
    host_relationship = "host_relationship"


def _parse_tags(tags: str | None) -> list[str] | None:
    if not tags:
        return None
    return normalize_tags(tags.split(",")) or None


def _apply_filters(
    query: Select,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
    tags: str | None = None,
) -> Select:
    # The dashboard reflects outreach that actually happened — planned/future
    # events are excluded until they're marked completed.
    query = query.where(Visit.status == VisitStatus.completed)
    if date_from:
        query = query.where(Visit.visit_date >= date_from)
    if date_to:
        query = query.where(Visit.visit_date <= date_to)
    # venue_type via a correlated EXISTS so it composes with any query shape.
    if venue_type:
        query = query.where(Visit.venue.has(Venue.venue_type == venue_type))
    if event_type:
        query = query.where(Visit.event_type == event_type)
    if audience_level:
        query = query.where(Visit.audience_level == audience_level)
    parsed_tags = _parse_tags(tags)
    if parsed_tags:
        query = query.where(Visit.tags.overlap(parsed_tags))
    return query


@router.get("/summary", response_model=StatsSummary)
def summary(
    db: DbSession,
    _user: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
    tags: str | None = None,
):
    row = db.execute(
        _apply_filters(
            select(
                func.count(Visit.id),
                func.coalesce(func.sum(Visit.people_reached), 0),
                func.count(func.distinct(Visit.venue_id)),
                func.count(func.distinct(Visit.author_id)),
                func.avg(Visit.rating),
            ),
            date_from=date_from,
            date_to=date_to,
            venue_type=venue_type,
            event_type=event_type,
            audience_level=audience_level,
            tags=tags,
        )
    ).one()
    return StatsSummary(
        total_visits=row[0],
        total_people_reached=row[1],
        distinct_venues=row[2],
        active_communicators=row[3],
        avg_rating=round(float(row[4]), 2) if row[4] is not None else None,
    )


@router.get("/timeseries", response_model=list[TimeseriesPoint])
def timeseries(
    db: DbSession,
    _user: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
    tags: str | None = None,
):
    # Bucket by half-year (H1 = Jan–Jun, H2 = Jul–Dec) → labels like "2026 H1".
    half = cast(func.floor((func.extract("month", Visit.visit_date) - 1) / 6) + 1, Integer)
    period = func.concat(func.to_char(Visit.visit_date, "YYYY"), " H", half)
    rows = db.execute(
        _apply_filters(
            select(
                period.label("period"),
                func.count(Visit.id),
                func.coalesce(func.sum(Visit.people_reached), 0),
            ),
            date_from=date_from,
            date_to=date_to,
            venue_type=venue_type,
            event_type=event_type,
            audience_level=audience_level,
            tags=tags,
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
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
    tags: str | None = None,
):
    columns = {
        BreakdownBy.venue_type: Venue.venue_type,
        BreakdownBy.event_type: Visit.event_type,
        BreakdownBy.audience_level: Visit.audience_level,
        BreakdownBy.host_relationship: Visit.host_relationship,
    }
    key = columns[by]
    query = select(
        key, func.count(Visit.id), func.coalesce(func.sum(Visit.people_reached), 0)
    )
    if by is BreakdownBy.venue_type:
        query = query.join(Visit.venue)
    # host_relationship is optional on a visit — omit the "unspecified" bucket.
    query = query.where(key.isnot(None))
    rows = db.execute(
        _apply_filters(
            query,
            date_from=date_from,
            date_to=date_to,
            venue_type=venue_type,
            event_type=event_type,
            audience_level=audience_level,
            tags=tags,
        )
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
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
    tags: str | None = None,
):
    rows = db.execute(
        _apply_filters(
            select(
                Venue,
                func.count(Visit.id),
                func.coalesce(func.sum(Visit.people_reached), 0),
            ).join(Visit.venue),
            date_from=date_from,
            date_to=date_to,
            venue_type=venue_type,
            event_type=event_type,
            audience_level=audience_level,
            tags=tags,
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
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
    tags: str | None = None,
):
    rows = db.execute(
        _apply_filters(
            select(
                User,
                func.count(Visit.id),
                func.coalesce(func.sum(Visit.people_reached), 0),
            ).join(Visit.author),
            date_from=date_from,
            date_to=date_to,
            venue_type=venue_type,
            event_type=event_type,
            audience_level=audience_level,
            tags=tags,
        )
        .group_by(User.id)
        .order_by(func.count(Visit.id).desc(), func.sum(Visit.people_reached).desc())
        .limit(limit)
    ).all()
    return [
        LeaderboardRow(user=UserBrief.model_validate(r[0]), visits=r[1], people_reached=r[2])
        for r in rows
    ]
