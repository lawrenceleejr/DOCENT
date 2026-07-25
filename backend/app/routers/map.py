from enum import Enum

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.deps import CurrentUser, DbSession
from app.models import (
    FederatedActivity,
    FederationPeer,
    Institution,
    InstitutionType,
    Venue,
    VenueType,
    Visit,
    VisitStatus,
)
from app.schemas import (
    FederatedMapPoint,
    InstitutionDetail,
    InstitutionPoint,
    MapExtent,
    VenuePoint,
)

router = APIRouter(prefix="/api", tags=["map"])

MAX_POINTS = 5000


class CoverageStatus(str, Enum):
    all = "all"
    covered = "covered"
    gap = "gap"


# Venue types are finer-grained than institution types; collapse each venue
# type down to the institution type the map's type filter speaks in, so the
# venue layer honors the same type checkboxes as the institution layer (#21).
_VENUE_TYPE_TO_INSTITUTION_TYPE = {
    VenueType.elementary_school: InstitutionType.school,
    VenueType.middle_school: InstitutionType.school,
    VenueType.high_school: InstitutionType.school,
    VenueType.community_college: InstitutionType.college,
    VenueType.university: InstitutionType.university,
    VenueType.museum: InstitutionType.museum,
    VenueType.library: InstitutionType.library,
    VenueType.community_center: InstitutionType.other,
    VenueType.other: InstitutionType.other,
}


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
    # Only COMPLETED visits count as coverage; the status lives in the join
    # ON-clause so unmatched institutions stay gaps (a WHERE would drop them).
    visit_count = func.count(Visit.id).label("visit_count")
    query = (
        select(Institution, visit_count)
        .outerjoin(Venue, Venue.institution_id == Institution.id)
        .outerjoin(
            Visit,
            (Visit.venue_id == Venue.id) & (Visit.status == VisitStatus.completed),
        )
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
    user: CurrentUser,
    south: float | None = None,
    north: float | None = None,
    west: float | None = None,
    east: float | None = None,
    types: str | None = Query(default=None, description="comma-separated institution types"),
    status: CoverageStatus = CoverageStatus.all,
    mine: bool = False,
):
    # Completed-visit count for the popup, and "visited" = has any visit that has
    # already happened (date today-or-earlier, any status). The latter drives the
    # green "reached" dot, so an overdue planned event still counts as visited.
    visit_count = func.count(Visit.id).filter(Visit.status == VisitStatus.completed).label(
        "visit_count"
    )
    visited_expr = func.coalesce(func.bool_or(Visit.visit_date <= func.current_date()), False)
    visited = visited_expr.label("visited")
    query = (
        select(Venue, visit_count, visited)
        .outerjoin(Visit, Visit.venue_id == Venue.id)
        .where(Venue.latitude.isnot(None), Venue.longitude.isnot(None))
        .group_by(Venue.id)
        .limit(MAX_POINTS)
    )
    query = _bbox(query, Venue.latitude, Venue.longitude, south, north, west, east)

    if mine:
        # "Show my venues" = venues I added or have a visit at (issue #21). It
        # is an explicit opt-in filter, no longer showing everyone's venues.
        my_visit_venues = select(Visit.venue_id).where(Visit.author_id == user.id)
        query = query.where(
            or_(Venue.created_by_id == user.id, Venue.id.in_(my_visit_venues))
        )

    if types:
        valid = {e.value for e in InstitutionType}
        wanted = {InstitutionType(t.strip()) for t in types.split(",") if t.strip() in valid}
        if wanted:
            venue_types = [
                vt for vt, it in _VENUE_TYPE_TO_INSTITUTION_TYPE.items() if it in wanted
            ]
            query = query.where(Venue.venue_type.in_(venue_types))

    # The map's all/reached/not-yet-visited control constrains this layer too, so
    # the filters aren't silently ignored on venues (issue #21).
    if status is CoverageStatus.covered:
        query = query.having(visited_expr)
    elif status is CoverageStatus.gap:
        query = query.having(~visited_expr)

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
            visited=visited_flag,
            institution_id=venue.institution_id,
        )
        for venue, count, visited_flag in rows
    ]


@router.get("/map/extent", response_model=MapExtent)
def map_extent(db: DbSession, _user: CurrentUser):
    """Bounding box of every venue that has at least one visit (completed or
    planned), so the map can open framed on the actual activity instead of a
    fixed radius (#18). Returns has_data=False when there's nothing to frame."""
    south, north, west, east = db.execute(
        select(
            func.min(Venue.latitude),
            func.max(Venue.latitude),
            func.min(Venue.longitude),
            func.max(Venue.longitude),
        )
        .where(Venue.latitude.isnot(None), Venue.longitude.isnot(None))
        .where(Venue.id.in_(select(Visit.venue_id)))
    ).one()
    if south is None:
        return MapExtent(has_data=False)
    return MapExtent(has_data=True, south=south, north=north, west=west, east=east)


@router.get("/map/federated", response_model=list[FederatedMapPoint])
def map_federated(
    db: DbSession,
    _user: CurrentUser,
    south: float | None = None,
    north: float | None = None,
    west: float | None = None,
    east: float | None = None,
):
    """Sibling activities with coordinates, as their own map layer. These never
    affect local covered/gap counting — they're other instances' venues. A
    sibling point that coincides with a place WE have already reached is dropped,
    so a jointly-visited institution reads as a single reached (green) marker."""
    query = (
        select(FederatedActivity, FederationPeer.label)
        .join(FederationPeer, FederatedActivity.peer_id == FederationPeer.id)
        .where(
            FederationPeer.enabled.is_(True),
            FederatedActivity.status == "completed",
            FederatedActivity.latitude.isnot(None),
            FederatedActivity.longitude.isnot(None),
        )
        .limit(MAX_POINTS)
    )
    query = _bbox(
        query, FederatedActivity.latitude, FederatedActivity.longitude, south, north, west, east
    )
    rows = db.execute(query).all()

    # Coordinates we've locally reached: covered institutions + visited venues.
    # Round to ~11 m so near-coincident points collapse.
    def key(lat: float, lon: float) -> tuple[float, float]:
        return (round(lat, 4), round(lon, 4))

    reached: set[tuple[float, float]] = set()
    covered_inst = _bbox(
        select(Institution.latitude, Institution.longitude)
        .join(Venue, Venue.institution_id == Institution.id)
        .join(Visit, (Visit.venue_id == Venue.id) & (Visit.status == VisitStatus.completed)),
        Institution.latitude, Institution.longitude, south, north, west, east,
    )
    for lat, lon in db.execute(covered_inst).all():
        if lat is not None and lon is not None:
            reached.add(key(lat, lon))
    visited_venues = _bbox(
        select(Venue.latitude, Venue.longitude)
        .join(Visit, (Visit.venue_id == Venue.id) & (Visit.status == VisitStatus.completed))
        .where(Venue.latitude.isnot(None), Venue.longitude.isnot(None)),
        Venue.latitude, Venue.longitude, south, north, west, east,
    )
    for lat, lon in db.execute(visited_venues).all():
        if lat is not None and lon is not None:
            reached.add(key(lat, lon))

    return [
        FederatedMapPoint(
            latitude=a.latitude,
            longitude=a.longitude,
            venue_name=a.venue_name,
            venue_type=a.venue_type,
            person_name=a.person_name,
            visit_date=a.visit_date,
            people_reached=a.people_reached,
            permalink=a.permalink,
            source_label=label,
        )
        for a, label in rows
        if key(a.latitude, a.longitude) not in reached
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
