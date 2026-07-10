from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentUser, DbSession
from app.models import Venue, VenueType, Visit
from app.schemas import VenueCreate, VenueDetail, VenueList, VenueOut, VenueUpdate

router = APIRouter(prefix="/api/venues", tags=["venues"])


@router.get("", response_model=VenueList)
def list_venues(
    db: DbSession,
    _user: CurrentUser,
    q: str | None = None,
    venue_type: VenueType | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
):
    query = select(Venue)
    if q:
        pattern = f"%{q}%"
        query = query.where(or_(Venue.name.ilike(pattern), Venue.city.ilike(pattern)))
    if venue_type:
        query = query.where(Venue.venue_type == venue_type)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(Venue.name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return VenueList(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=VenueOut, status_code=status.HTTP_201_CREATED)
def create_venue(body: VenueCreate, user: CurrentUser, db: DbSession):
    venue = Venue(**body.model_dump(), created_by_id=user.id)
    db.add(venue)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A venue with this name and city already exists — search for it instead",
        )
    db.refresh(venue)
    return venue


@router.get("/{venue_id}", response_model=VenueDetail)
def get_venue(venue_id: int, db: DbSession, _user: CurrentUser):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    visit_count, last_visit_date = db.execute(
        select(func.count(Visit.id), func.max(Visit.visit_date)).where(
            Visit.venue_id == venue_id
        )
    ).one()
    return VenueDetail(
        **VenueOut.model_validate(venue).model_dump(),
        visit_count=visit_count,
        last_visit_date=last_visit_date,
    )


@router.patch("/{venue_id}", response_model=VenueOut)
def update_venue(venue_id: int, body: VenueUpdate, user: CurrentUser, db: DbSession):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    if venue.created_by_id != user.id and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the venue creator or an admin can edit a venue",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(venue, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A venue with this name and city already exists",
        )
    db.refresh(venue)
    return venue
