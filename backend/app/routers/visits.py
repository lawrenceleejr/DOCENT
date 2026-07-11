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
from app.schemas import VisitCreate, VisitList, VisitOut, VisitUpdate
from app.services.ics import CalendarEvent, build_calendar

router = APIRouter(prefix="/api/visits", tags=["visits"])

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
):
    query = select(Visit).join(Visit.venue)
    if status:
        query = query.where(Visit.status == status)
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
    sort: str = "-visit_date",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    query = _filtered_query(
        date_from, date_to, venue_id, venue_type, event_type, audience_level,
        author_id, q, status,
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    query = _apply_sort(query, sort).options(
        joinedload(Visit.author), joinedload(Visit.venue)
    )
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return VisitList(items=items, total=total, page=page, page_size=page_size)


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
):
    query = _apply_sort(
        _filtered_query(
            date_from, date_to, venue_id, venue_type, event_type, audience_level,
            author_id, q, status,
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
                "people_reached", "duration_minutes", "rating", "venue", "venue_type",
                "city", "state", "author", "host_name", "host_role", "host_relationship",
                "host_relationship_detail", "host_email", "host_phone", "host_notes",
                "follow_up_planned", "additional_presenters", "description", "reflection",
            ]
        )
        for v in visits:
            writer.writerow(
                [
                    v.visit_date.isoformat(),
                    v.start_time.strftime("%H:%M") if v.start_time else None,
                    v.status.value, v.title, v.event_type.value,
                    v.audience_level.value, v.people_reached, v.duration_minutes,
                    v.rating, v.venue.name, v.venue.venue_type.value, v.venue.city,
                    v.venue.state, v.author.name, v.contact_name, v.host_role,
                    v.host_relationship.value if v.host_relationship else None,
                    v.host_relationship_detail, v.contact_email, v.contact_phone,
                    v.host_notes, v.follow_up_planned, v.additional_presenters,
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
):
    # Default to the current user's planned (upcoming) events; params allow
    # broader exports (e.g. all of my events) via the same filter machinery.
    if author_id is None:
        author_id = user.id
    query = _apply_sort(
        _filtered_query(
            date_from, date_to, venue_id, venue_type, event_type, audience_level,
            author_id, q, status,
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
