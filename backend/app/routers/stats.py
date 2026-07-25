from datetime import date
from enum import Enum

from fastapi import APIRouter, Query
from sqlalchemy import Integer, Select, cast, func, or_, select

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


def _parse_enum_list(raw: str | None, enum_cls):
    """Comma-separated query value → list of enum members (unknown values
    dropped), or None when nothing valid remains. Lets each analysis filter
    accept several categories at once (#13). A single value still parses, so
    existing single-select callers keep working unchanged."""
    if not raw:
        return None
    out = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(enum_cls(part))
        except ValueError:
            continue
    return out or None


def _half_year_period(d) -> str:
    """Match the SQL half-year bucket label, e.g. "2026 H1"."""
    return f"{d.year} H{1 if d.month <= 6 else 2}"


def _choose_granularity(span_days: int) -> str:
    """Pick the time-bucket size from how much history there is, so a young
    instance gets monthly detail instead of one or two half-year bars (#27)."""
    if span_days <= 550:  # up to ~18 months
        return "month"
    if span_days <= 1900:  # up to ~5 years
        return "quarter"
    return "half"


def _period_label_py(d, granularity: str) -> str:
    """Python-side bucket label (for federated rows), matching the SQL below."""
    if granularity == "month":
        return f"{d.year}-{d.month:02d}"
    if granularity == "quarter":
        return f"{d.year} Q{(d.month - 1) // 3 + 1}"
    return _half_year_period(d)


def _period_sql(granularity: str):
    """SQL expression producing the same, lexically-sortable bucket labels."""
    if granularity == "month":
        return func.to_char(func.date_trunc("month", Visit.visit_date), "YYYY-MM")
    if granularity == "quarter":
        return func.concat(
            func.to_char(Visit.visit_date, "YYYY"),
            " Q",
            cast(func.extract("quarter", Visit.visit_date), Integer),
        )
    half = cast(func.floor((func.extract("month", Visit.visit_date) - 1) / 6) + 1, Integer)
    return func.concat(func.to_char(Visit.visit_date, "YYYY"), " H", half)


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
    q=None,
):
    """Cached federated activities matching the filters. The limited feed carries
    no audience/tags data, so those filters exclude federated rows entirely; the
    multi-select venue/event filters and the people search are applied in Python
    over the small cache. The people search can only match the fields the feed
    carries (lead presenter and venue names) — that partial coverage is what the
    sibling-filtering caveat warns communicators about (#13)."""
    if not include_federated or _parse_enum_list(audience_level, AudienceLevel) or _parse_tags(tags):
        return []
    rows = [a for a, _label in federated_query(db, date_from=date_from, date_to=date_to)]
    venue_types = _parse_enum_list(venue_type, VenueType)
    if venue_types:
        wanted = {v.value for v in venue_types}
        rows = [a for a in rows if a.venue_type in wanted]
    event_types = _parse_enum_list(event_type, EventType)
    if event_types:
        wanted = {e.value for e in event_types}
        rows = [a for a in rows if a.event_type in wanted]
    if q and q.strip():
        needle = q.strip().lower()
        rows = [
            a
            for a in rows
            if (a.person_name and needle in a.person_name.lower())
            or (a.venue_name and needle in a.venue_name.lower())
        ]
    return rows


def _apply_filters(
    query: Select,
    *,
    status: VisitStatus = VisitStatus.completed,
    date_from: date | None = None,
    date_to: date | None = None,
    venue_type: str | None = None,
    event_type: str | None = None,
    audience_level: str | None = None,
    tags: str | None = None,
    q: str | None = None,
) -> Select:
    # The dashboard reflects outreach that actually happened — planned/future
    # events are excluded from the main stats (but the timeseries pulls them in
    # as a separate scheduled series by passing status=planned).
    query = query.where(Visit.status == status)
    if date_from:
        query = query.where(Visit.visit_date >= date_from)
    if date_to:
        query = query.where(Visit.visit_date <= date_to)
    # Each category filter now accepts several values at once (#13). venue_type
    # goes through a correlated EXISTS so it composes with any query shape.
    venue_types = _parse_enum_list(venue_type, VenueType)
    if venue_types:
        query = query.where(Visit.venue.has(Venue.venue_type.in_(venue_types)))
    event_types = _parse_enum_list(event_type, EventType)
    if event_types:
        query = query.where(Visit.event_type.in_(event_types))
    audience_levels = _parse_enum_list(audience_level, AudienceLevel)
    if audience_levels:
        query = query.where(Visit.audience_level.in_(audience_levels))
    parsed_tags = _parse_tags(tags)
    if parsed_tags:
        query = query.where(Visit.tags.overlap(parsed_tags))
    # People search: match the communicator (author), the host, or the free-text
    # additional presenters, so "filter by people involved" works here too (#13).
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                Visit.author.has(User.name.ilike(pattern)),
                Visit.contact_name.ilike(pattern),
                Visit.additional_presenters.ilike(pattern),
            )
        )
    return query


@router.get("/summary", response_model=StatsSummary)
def summary(
    db: DbSession,
    _user: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
    venue_type: str | None = None,
    event_type: str | None = None,
    audience_level: str | None = None,
    tags: str | None = None,
    q: str | None = None,
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
            q=q,
        )
    ).one()
    total_visits, total_people, distinct_venues, active_communicators = (
        row[0], row[1], row[2], row[3]
    )
    # Add sibling activities (different instances → their venues/people don't
    # overlap ours). Rating stays local-only (the feed carries no ratings).
    fed_rows = _federated_rows(
        db, include_federated=include_federated, date_from=date_from, date_to=date_to,
        venue_type=venue_type, event_type=event_type, audience_level=audience_level, tags=tags, q=q,
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
    venue_type: str | None = None,
    event_type: str | None = None,
    audience_level: str | None = None,
    tags: str | None = None,
    q: str | None = None,
    include_federated: bool = True,
):
    # Size the buckets from the actual data span (completed + planned), so a new
    # instance with only a few months of history gets monthly detail (#27).
    filters = dict(
        date_from=date_from, date_to=date_to, venue_type=venue_type,
        event_type=event_type, audience_level=audience_level, tags=tags, q=q,
    )
    c_lo, c_hi = db.execute(
        _apply_filters(select(func.min(Visit.visit_date), func.max(Visit.visit_date)), **filters)
    ).one()
    p_lo, p_hi = db.execute(
        _apply_filters(
            select(func.min(Visit.visit_date), func.max(Visit.visit_date)),
            status=VisitStatus.planned, **filters,
        )
    ).one()
    lows = [d for d in (c_lo, p_lo) if d]
    highs = [d for d in (c_hi, p_hi) if d]
    span_days = (max(highs) - min(lows)).days if lows and highs else 0
    granularity = _choose_granularity(span_days)
    period = _period_sql(granularity)

    # [visits, people_reached, planned_visits] per bucket.
    buckets: dict[str, list[int]] = {}
    completed = db.execute(
        _apply_filters(
            select(
                period.label("period"),
                func.count(Visit.id),
                func.coalesce(func.sum(Visit.people_reached), 0),
            ),
            **filters,
        )
        .group_by("period")
        .order_by("period")
    ).all()
    for p, visits, people in completed:
        buckets[p] = [visits, people, 0]

    # Scheduled (planned) visits — a separate, dotted series (#28).
    planned = db.execute(
        _apply_filters(
            select(period.label("period"), func.count(Visit.id)),
            status=VisitStatus.planned,
            **filters,
        )
        .group_by("period")
        .order_by("period")
    ).all()
    for p, n in planned:
        buckets.setdefault(p, [0, 0, 0])[2] = n

    # Federated (completed) activity folds into the primary series.
    for a in _federated_rows(
        db, include_federated=include_federated, date_from=date_from, date_to=date_to,
        venue_type=venue_type, event_type=event_type, audience_level=audience_level, tags=tags, q=q,
    ):
        b = buckets.setdefault(_period_label_py(a.visit_date, granularity), [0, 0, 0])
        b[0] += 1
        b[1] += a.people_reached

    return [
        TimeseriesPoint(period=p, visits=v, people_reached=pr, planned_visits=pl)
        for p, (v, pr, pl) in sorted(buckets.items())
    ]


@router.get("/breakdown", response_model=list[BreakdownRow])
def breakdown(
    db: DbSession,
    _user: CurrentUser,
    by: BreakdownBy = Query(default=BreakdownBy.venue_type),
    date_from: date | None = None,
    date_to: date | None = None,
    venue_type: str | None = None,
    event_type: str | None = None,
    audience_level: str | None = None,
    tags: str | None = None,
    q: str | None = None,
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
            q=q,
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
            venue_type=venue_type, event_type=event_type, audience_level=audience_level, tags=tags, q=q,
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
    venue_type: str | None = None,
    event_type: str | None = None,
    audience_level: str | None = None,
    tags: str | None = None,
    q: str | None = None,
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
            q=q,
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
    venue_type: str | None = None,
    event_type: str | None = None,
    audience_level: str | None = None,
    tags: str | None = None,
    q: str | None = None,
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
            q=q,
        )
        .group_by(User.id)
        .order_by(func.count(Visit.id).desc(), func.sum(Visit.people_reached).desc())
        .limit(limit)
    ).all()
    return [
        LeaderboardRow(user=UserBrief.model_validate(r[0]), visits=r[1], people_reached=r[2])
        for r in rows
    ]
