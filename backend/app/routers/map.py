from enum import Enum

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import Institution, InstitutionType, Venue, Visit
from app.schemas import InstitutionDetail, InstitutionPoint, VenuePoint

router = APIRouter(prefix="/api", tags=["map"])

MAX_POINTS = 5000


class CoverageStatus(str, Enum):
    all = "all"
    covered = "covered"
    gap = "gap"


def _bbox(query, column_lat, column_lon, south, north, west, east):
    if None not in (south, north):
        query = query.where(column_lat >= south, column_lat <= north)
    if None not in (west, east):
        query = query.where(column_lon >= west, column_lon <= east)
    return query


@router.get("/map/institutions", response_model=list[InstitutionPoint])
def map_institutions(
    db: DbSession,
    _user: CurrentUser,
    south: float | None = None,
    north: float | None = None,
    west: float | None = None,
    east: float | None = None,
    types: str | None = Query(default=None, description="comma-separated institution types"),
    status: CoverageStatus = CoverageStatus.all,
):
    visit_count = func.count(Visit.id).label("visit_count")
    query = (
        select(Institution, visit_count)
        .outerjoin(Venue, Venue.institution_id == Institution.id)
        .outerjoin(Visit, Visit.venue_id == Venue.id)
        .group_by(Institution.id)
        .limit(MAX_POINTS)
    )
    query = _bbox(query, Institution.latitude, Institution.longitude, south, north, west, east)

    if types:
        valid = {e.value for e in InstitutionType}
        wanted = [InstitutionType(t.strip()) for t in types.split(",") if t.strip() in valid]
        if wanted:
            query = query.where(Institution.institution_type.in_(wanted))

    if status is CoverageStatus.covered:
        query = query.having(func.count(Visit.id) > 0)
    elif status is CoverageStatus.gap:
        query = query.having(func.count(Visit.id) == 0)

    rows = db.execute(query).all()
    return [
        InstitutionPoint(
            id=inst.id,
            name=inst.name,
            institution_type=inst.institution_type,
            latitude=inst.latitude,
            longitude=inst.longitude,
            city=inst.city,
            covered=count > 0,
            visit_count=count,
        )
        for inst, count in rows
    ]


@router.get("/map/venues", response_model=list[VenuePoint])
def map_venues(
    db: DbSession,
    _user: CurrentUser,
    south: float | None = None,
    north: float | None = None,
    west: float | None = None,
    east: float | None = None,
):
    visit_count = func.count(Visit.id).label("visit_count")
    query = (
        select(Venue, visit_count)
        .outerjoin(Visit, Visit.venue_id == Venue.id)
        .where(Venue.latitude.isnot(None), Venue.longitude.isnot(None))
        .group_by(Venue.id)
        .limit(MAX_POINTS)
    )
    query = _bbox(query, Venue.latitude, Venue.longitude, south, north, west, east)
    rows = db.execute(query).all()
    return [
        VenuePoint(
            id=venue.id,
            name=venue.name,
            venue_type=venue.venue_type,
            latitude=venue.latitude,
            longitude=venue.longitude,
            city=venue.city,
            visit_count=count,
            institution_id=venue.institution_id,
        )
        for venue, count in rows
    ]


@router.get("/institutions", response_model=list[InstitutionDetail])
def search_institutions(
    db: DbSession,
    _user: CurrentUser,
    q: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
):
    query = select(Institution)
    if q:
        query = query.where(Institution.name.ilike(f"%{q}%"))
    query = query.order_by(Institution.name).limit(limit)
    return db.scalars(query).all()


@router.get("/institutions/{institution_id}", response_model=InstitutionDetail)
def get_institution(institution_id: int, db: DbSession, _user: CurrentUser):
    inst = db.get(Institution, institution_id)
    if not inst:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution not found")
    return inst
