import csv
import io
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import joinedload

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
from app.models import FederatedActivity
from app.schemas import (
    ActivityListItem,
    UserBrief,
    VenueBrief,
    VisitCreate,
    VisitList,
    VisitOut,
    VisitUpdate,
    normalize_tags,
)
from app.services.federation import federated_query
from app.services.ics import CalendarEvent, build_calendar

router = APIRouter(prefix="/api/visits", tags=["visits"])


def _local_item(v: Visit) -> ActivityListItem:
    return ActivityListItem(
        source="local",
        id=v.id,
        external_url=None,
        visit_date=v.visit_date,
        start_time=v.start_time,
        status=v.status,
        title=v.title,
        event_type=v.event_type,
        audience_level=v.audience_level,
        language=v.language,
        people_reached=v.people_reached,
        rating=v.rating,
        tags=list(v.tags or []),
        author=UserBrief.model_validate(v.author) if v.author else None,
        venue=VenueBrief.model_validate(v.venue) if v.venue else None,
    )


def _federated_item(a: FederatedActivity, label: str | None) -> ActivityListItem:
    try:
        event = EventType(a.event_type) if a.event_type else None
    except ValueError:
        event = None
    try:
        vtype = VenueType(a.venue_type) if a.venue_type else VenueType.other
    except ValueError:
        vtype = VenueType.other
    # Synthetic nested objects (id 0) so the row shares the local visit shape;
    # the frontend never linkifies them (source != "local").
    return ActivityListItem(
        source=label or "sibling",
        id=None,
        external_url=a.permalink,
        visit_date=a.visit_date,
        start_time=None,
        status=None,
        title=None,
        event_type=event,
        audience_level=None,
        people_reached=a.people_reached,
        rating=None,
        tags=[],
        author=UserBrief(id=0, name=a.person_name or "—"),
        venue=VenueBrief(id=0, name=a.venue_name or "—", venue_type=vtype, city=a.venue_city),
    )


def _sort_key(item: ActivityListItem, field: str):
    """Sort key across mixed local/federated rows; missing values sort last in
    descending order (federated rows lack rating, etc.)."""
    if field == "people_reached":
        primary = item.people_reached
    elif field == "rating":
        primary = item.rating if item.rating is not None else -1
    else:  # visit_date (and created_at, which federated rows lack)
        primary = item.visit_date.toordinal()
    # Tiebreak: local rows before federated on the same day, then by id.
    return (primary, 0 if item.source == "local" else 1, item.id or 0)


def _parse_tags(tags: str | None) -> list[str] | None:
    """Comma-separated `tags` query param → normalized list (or None)."""
    if not tags:
        return None
    parsed = normalize_tags(tags.split(","))
    return parsed or None

SORTABLE = {
    "visit_date": Visit.visit_date,
    "people_reached": Visit.people_reached,
    "created_at": Visit.created_at,
    "rating": Visit.rating,
}


def _filtered_query(
    date_from: date | None,
    date_to: date | None,
    venue_id: int | None,
    venue_type: VenueType | None,
    event_type: EventType | None,
    audience_level: AudienceLevel | None,
    author_id: int | None,
    q: str | None = None,
    status: VisitStatus | None = None,
    tags: list[str] | None = None,
    language: str | None = None,
):
    query = select(Visit).join(Visit.venue)
    if status:
        query = query.where(Visit.status == status)
    if tags:
        # Match a visit that carries ANY of the requested tags.
        query = query.where(Visit.tags.overlap(tags))
    if language:
        query = query.where(Visit.language == language)
    if date_from:
        query = query.where(Visit.visit_date >= date_from)
    if date_to:
        query = query.where(Visit.visit_date <= date_to)
    if venue_id:
        query = query.where(Visit.venue_id == venue_id)
    if venue_type:
        query = query.where(Venue.venue_type == venue_type)
    if event_type:
        query = query.where(Visit.event_type == event_type)
    if audience_level:
        query = query.where(Visit.audience_level == audience_level)
    if author_id:
        query = query.where(Visit.author_id == author_id)
    if q:
        pattern = f"%{q}%"
        query = query.where(
            or_(
                Visit.title.ilike(pattern),
                Visit.description.ilike(pattern),
                Visit.reflection.ilike(pattern),
            )
        )
    return query


def _apply_sort(query, sort: str):
    field = sort.lstrip("-")
    column = SORTABLE.get(field, Visit.visit_date)
    ordered = column.desc() if sort.startswith("-") else column.asc()
    return query.order_by(ordered, Visit.id.desc())


def _get_visit_or_404(visit_id: int, db) -> Visit:
    visit = db.get(Visit, visit_id, options=[joinedload(Visit.author), joinedload(Visit.venue)])
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
    return visit


def _require_author_or_admin(visit: Visit, user: User) -> None:
    if visit.author_id != user.id and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author or an admin can modify this visit",
        )


@router.get("", response_model=VisitList)
def list_visits(
    db: DbSession,
    _user: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
    venue_id: int | None = None,
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
    author_id: int | None = None,
    q: str | None = None,
    status: VisitStatus | None = None,
    tags: str | None = None,
    language: str | None = None,
    include_federated: bool = True,
    sort: str = "-visit_date",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    query = _filtered_query(
        date_from, date_to, venue_id, venue_type, event_type, audience_level,
        author_id, q, status, _parse_tags(tags), language,
    )

    # Sibling activities only join in when every active filter is one the
    # limited feed can satisfy — otherwise a federated row would wrongly ignore
    # (e.g.) an author/keyword/audience/tag filter it has no data for.
    federated_eligible = (
        include_federated
        and author_id is None
        and venue_id is None
        and not q
        and not _parse_tags(tags)
        and not language
        and audience_level is None
        and status != VisitStatus.planned
    )

    if not federated_eligible:
        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        paged = _apply_sort(query, sort).options(
            joinedload(Visit.author), joinedload(Visit.venue)
        )
        rows = db.scalars(paged.offset((page - 1) * page_size).limit(page_size)).all()
        return VisitList(
            items=[_local_item(v) for v in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    # Merged path: pull the full filtered local set + matching federated rows,
    # combine, sort, and paginate in Python (community-scale volumes).
    local = db.scalars(
        query.options(joinedload(Visit.author), joinedload(Visit.venue))
    ).all()
    items = [_local_item(v) for v in local]
    for activity, label in federated_query(
        db,
        date_from=date_from,
        date_to=date_to,
        venue_type=venue_type.value if venue_type else None,
        event_type=event_type.value if event_type else None,
    ):
        items.append(_federated_item(activity, label))

    field = sort.lstrip("-")
    items.sort(key=lambda it: _sort_key(it, field), reverse=sort.startswith("-"))
    total = len(items)
    start = (page - 1) * page_size
    return VisitList(
        items=items[start : start + page_size],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/export.csv")
def export_csv(
    db: DbSession,
    _user: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
    venue_id: int | None = None,
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
    author_id: int | None = None,
    q: str | None = None,
    status: VisitStatus | None = None,
    tags: str | None = None,
    language: str | None = None,
):
    query = _apply_sort(
        _filtered_query(
            date_from, date_to, venue_id, venue_type, event_type, audience_level,
            author_id, q, status, _parse_tags(tags), language,
        ),
        "-visit_date",
    ).options(joinedload(Visit.author), joinedload(Visit.venue))
    visits = db.scalars(query).all()

    def generate():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "date", "start_time", "status", "title", "event_type", "audience_level",
                "language", "people_reached", "duration_minutes", "rating", "venue",
                "venue_type", "city", "state", "author", "host_name", "host_role",
                "host_relationship", "host_relationship_detail", "host_email",
                "host_phone", "host_notes", "follow_up_planned", "additional_presenters",
                "tags", "coverage", "coverage_links", "description", "reflection",
            ]
        )
        for v in visits:
            cats = sorted({(lk.get("category") or "other") for lk in (v.links or [])})
            urls = "; ".join(lk.get("url", "") for lk in (v.links or []))
            writer.writerow(
                [
                    v.visit_date.isoformat(),
                    v.start_time.strftime("%H:%M") if v.start_time else None,
                    v.status.value, v.title, v.event_type.value,
                    v.audience_level.value, v.language, v.people_reached,
                    v.duration_minutes,
                    v.rating, v.venue.name, v.venue.venue_type.value, v.venue.city,
                    v.venue.state, v.author.name, v.contact_name, v.host_role,
                    v.host_relationship.value if v.host_relationship else None,
                    v.host_relationship_detail, v.contact_email, v.contact_phone,
                    v.host_notes, v.follow_up_planned, v.additional_presenters,
                    "; ".join(v.tags), "; ".join(cats), urls,
                    v.description, v.reflection,
                ]
            )
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)
        yield buffer.getvalue()

    filename = f"docent-visits-{date.today().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/calendar.ics")
def calendar_ics(
    db: DbSession,
    user: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
    venue_id: int | None = None,
    venue_type: VenueType | None = None,
    event_type: EventType | None = None,
    audience_level: AudienceLevel | None = None,
    author_id: int | None = None,
    q: str | None = None,
    status: VisitStatus | None = VisitStatus.planned,
    tags: str | None = None,
    language: str | None = None,
    everyone: bool = False,
):
    # Default to the current user's planned (upcoming) events; params allow
    # broader exports (e.g. all of my events) via the same filter machinery.
    # `everyone=true` exports the whole community's schedule (no author filter).
    if author_id is None and not everyone:
        author_id = user.id
    query = _apply_sort(
        _filtered_query(
            date_from, date_to, venue_id, venue_type, event_type, audience_level,
            author_id, q, status, _parse_tags(tags), language,
        ),
        "visit_date",
    ).options(joinedload(Visit.venue))
    visits = db.scalars(query).all()

    events = [
        CalendarEvent(
            id=v.id,
            title=v.title,
            venue_name=v.venue.name,
            visit_date=v.visit_date,
            start_time=v.start_time,
            duration_minutes=v.duration_minutes,
            status=v.status,
            location=", ".join(
                p for p in (v.venue.address, v.venue.city, v.venue.state) if p
            )
            or None,
            description=v.description,
        )
        for v in visits
    ]
    body = build_calendar(events, datetime.now(timezone.utc))
    filename = f"docent-schedule-{date.today().strftime('%Y%m%d')}.ics"
    return Response(
        content=body,
        media_type="text/calendar",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/tags", response_model=list[str])
def list_tags(db: DbSession, _user: CurrentUser):
    """Distinct tags in use across all visits (for autocomplete/filtering)."""
    tag = func.unnest(Visit.tags).label("tag")
    rows = db.execute(select(tag).group_by(tag).order_by(tag)).all()
    return [r[0] for r in rows]


@router.post("", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
def create_visit(body: VisitCreate, user: CurrentUser, db: DbSession):
    if not db.get(Venue, body.venue_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    visit = Visit(**body.model_dump(), author_id=user.id)
    db.add(visit)
    db.commit()
    return _get_visit_or_404(visit.id, db)


@router.get("/{visit_id}", response_model=VisitOut)
def get_visit(visit_id: int, db: DbSession, _user: CurrentUser):
    return _get_visit_or_404(visit_id, db)


@router.patch("/{visit_id}", response_model=VisitOut)
def update_visit(visit_id: int, body: VisitUpdate, user: CurrentUser, db: DbSession):
    visit = _get_visit_or_404(visit_id, db)
    _require_author_or_admin(visit, user)
    updates = body.model_dump(exclude_unset=True)
    if "venue_id" in updates and not db.get(Venue, updates["venue_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    for field, value in updates.items():
        setattr(visit, field, value)
    db.commit()
    return _get_visit_or_404(visit_id, db)


@router.delete("/{visit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_visit(visit_id: int, user: CurrentUser, db: DbSession):
    visit = _get_visit_or_404(visit_id, db)
    _require_author_or_admin(visit, user)
    db.delete(visit)
    db.commit()
