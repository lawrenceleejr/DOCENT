from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentAdmin, CurrentUser, DbSession
from app.models import Institution, Venue, VenueType, Visit
from app.schemas import (
    VenueCreate,
    VenueDetail,
    VenueList,
    VenueListItem,
    VenueMergeRequest,
    VenueOut,
    VenueUpdate,
)


def _venue_detail(venue: Venue, db) -> VenueDetail:
    visit_count, last_visit_date = db.execute(
        select(func.count(Visit.id), func.max(Visit.visit_date)).where(
            Visit.venue_id == venue.id
        )
    ).one()
    return VenueDetail(
        **VenueOut.model_validate(venue).model_dump(),
        visit_count=visit_count,
        last_visit_date=last_visit_date,
    )

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
    filters = []
    if q:
        pattern = f"%{q}%"
        filters.append(or_(Venue.name.ilike(pattern), Venue.city.ilike(pattern)))
    if venue_type:
        filters.append(Venue.venue_type == venue_type)

    total = db.scalar(select(func.count()).select_from(Venue).where(*filters)) or 0
    visit_count = func.count(Visit.id).label("visit_count")
    rows = db.execute(
        select(Venue, visit_count)
        .outerjoin(Visit, Visit.venue_id == Venue.id)
        .where(*filters)
        .group_by(Venue.id)
        .order_by(Venue.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        VenueListItem(
            **VenueOut.model_validate(venue).model_dump(), visit_count=count
        )
        for venue, count in rows
    ]
    return VenueList(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=VenueOut, status_code=status.HTTP_201_CREATED)
def create_venue(body: VenueCreate, user: CurrentUser, db: DbSession):
    if body.institution_id is not None and not db.get(Institution, body.institution_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Institution not found"
        )
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


@router.post("/{venue_id}/merge", response_model=VenueDetail)
def merge_venues(
    venue_id: int, body: VenueMergeRequest, _admin: CurrentAdmin, db: DbSession
):
    """Merge duplicate venues into this one: move all their visits here, then
    delete them. Admin-only, since it spans other researchers' data."""
    target = db.get(Venue, venue_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    from_ids = [i for i in dict.fromkeys(body.from_ids) if i != venue_id]
    if not from_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pick at least one other venue to merge in.",
        )
    sources = db.scalars(select(Venue).where(Venue.id.in_(from_ids))).all()
    if len(sources) != len(from_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="One or more venues not found"
        )
    db.execute(
        update(Visit).where(Visit.venue_id.in_(from_ids)).values(venue_id=venue_id)
    )
    for source in sources:
        db.delete(source)
    db.commit()
    db.refresh(target)
    return _venue_detail(target, db)


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


@router.delete("/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_venue(venue_id: int, user: CurrentUser, db: DbSession):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    if venue.created_by_id != user.id and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the venue creator or an admin can delete a venue",
        )
    visit_count = db.scalar(
        select(func.count(Visit.id)).where(Visit.venue_id == venue_id)
    )
    if visit_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This venue has {visit_count} visit(s). Reassign or delete those "
                "visits before deleting the venue."
            ),
        )
    db.delete(venue)
    db.commit()
