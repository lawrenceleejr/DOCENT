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
from app.services.federation import federated_query

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


def _half_year_period(d) -> str:
    """Match the SQL half-year bucket label, e.g. "2026 H1"."""
    return f"{d.year} H{1 if d.month <= 6 else 2}"


def _federated_rows(
    db,
    *,
    include_federated: bool,
    date_from,
    date_to,
    venue_type,
    event_type,
    audience_level,
    tags,
):
    """Cached federated activities matching the filters — but only when every
    active filter is one the limited feed can satisfy (the feed has no
    audience/tags data, so those filters exclude federated rows entirely)."""
    if not include_federated or audience_level is not None or _parse_tags(tags):
        return []
    return [
        a
        for a, _label in federated_query(
            db,
            date_from=date_from,
            date_to=date_to,
            venue_type=venue_type.value if venue_type else None,
            event_type=event_type.value if event_type else None,
        )
    ]


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
    include_federated: bool = True,
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
    total_visits, total_people, distinct_venues, active_communicators = (
        row[0], row[1], row[2], row[3]
    )
    # Add sibling activities (different instances → their venues/people don't
    # overlap ours). Rating stays local-only (the feed carries no ratings).
    fed_rows = _federated_rows(
        db, include_federated=include_federated, date_from=date_from, date_to=date_to,
        venue_type=venue_type, event_type=event_type, audience_level=audience_level, tags=tags,
    )
    if fed_rows:
        total_visits += len(fed_rows)
        total_people += sum(a.people_reached for a in fed_rows)
        distinct_venues += len({(a.venue_name, a.venue_city) for a in fed_rows})
        active_communicators += len({a.person_name for a in fed_rows if a.person_name})
    return StatsSummary(
        total_visits=total_visits,
        total_people_reached=total_people,
        distinct_venues=distinct_venues,
        active_communicators=active_communicators,
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
    include_federated: bool = True,
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
    buckets: dict[str, list[int]] = {r[0]: [r[1], r[2]] for r in rows}
    for a in _federated_rows(
        db, include_federated=include_federated, date_from=date_from, date_to=date_to,
        venue_type=venue_type, event_type=event_type, audience_level=audience_level, tags=tags,
    ):
        b = buckets.setdefault(_half_year_period(a.visit_date), [0, 0])
        b[0] += 1
        b[1] += a.people_reached
    return [
        TimeseriesPoint(period=p, visits=v, people_reached=pr)
        for p, (v, pr) in sorted(buckets.items())
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
    include_federated: bool = True,
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
    buckets: dict[str, list[int]] = {r[0].value: [r[1], r[2]] for r in rows}
    # venue_type / event_type / audience_level breakdowns can include federated
    # rows (the feed carries those); host_relationship stays local-only.
    _FED_KEY = {
        BreakdownBy.venue_type: "venue_type",
        BreakdownBy.event_type: "event_type",
        BreakdownBy.audience_level: "audience_level",
    }
    if by in _FED_KEY:
        attr = _FED_KEY[by]
        for a in _federated_rows(
            db, include_federated=include_federated, date_from=date_from, date_to=date_to,
            venue_type=venue_type, event_type=event_type, audience_level=audience_level, tags=tags,
        ):
            raw = getattr(a, attr)
            if not raw:
                continue
            b = buckets.setdefault(raw, [0, 0])
            b[0] += 1
            b[1] += a.people_reached
    return [
        BreakdownRow(key=k, visits=v, people_reached=pr)
        for k, (v, pr) in sorted(buckets.items(), key=lambda kv: kv[1][0], reverse=True)
    ]


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
