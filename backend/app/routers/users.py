from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.deps import CurrentUser, DbSession
from app.models import Connection, HostRelationship, User, UserSchool, Venue, Visit
from app.schemas import (
    ContributorUser,
    DirectoryUserList,
    DirectoryUserOut,
    ProfileVisit,
    SchoolCreate,
    SchoolOut,
    UserOut,
    UserProfileOut,
    UserUpdate,
)
from app.security import hash_password, verify_password
from app.services.settings import user_directory_visible

router = APIRouter(prefix="/api/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: CurrentUser, db: DbSession):
    if body.name is not None:
        user.name = body.name
    if body.affiliation is not None:
        user.affiliation = body.affiliation
    if body.position is not None:
        user.position = body.position
    # Present-in-request (even as null) means "set it", so an ORCID can be cleared.
    if "orcid" in body.model_fields_set:
        user.orcid = body.orcid
    if body.languages_spoken is not None:
        user.languages_spoken = body.languages_spoken

    if body.new_password is not None:
        if not body.current_password or not verify_password(
            body.current_password, user.password_hash
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Current password is incorrect",
            )
        user.password_hash = hash_password(body.new_password)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/search", response_model=list[ContributorUser])
def search_users(
    user: CurrentUser,
    db: DbSession,
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=10, ge=1, le=25),
):
    """Targeted active-user search for linking co-presenters to accounts (#9).
    Returns nothing for a blank query, and never lists the current user."""
    if not q.strip():
        return []
    rows = db.scalars(
        select(User)
        .where(
            User.is_active.is_(True),
            User.id != user.id,
            User.name.ilike(f"%{q.strip()}%"),
        )
        .order_by(User.name)
        .limit(limit)
    ).all()
    return rows


@router.get("/me/schools", response_model=list[SchoolOut])
def list_my_schools(user: CurrentUser, db: DbSession):
    schools = db.scalars(
        select(UserSchool)
        .where(UserSchool.user_id == user.id)
        .options(joinedload(UserSchool.venue))
        .order_by(UserSchool.created_at)
    ).all()
    return schools


@router.post("/me/schools", response_model=SchoolOut, status_code=status.HTTP_201_CREATED)
def add_my_school(body: SchoolCreate, user: CurrentUser, db: DbSession):
    venue = db.get(Venue, body.venue_id)
    if not venue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found")
    existing = db.scalar(
        select(UserSchool).where(
            UserSchool.user_id == user.id, UserSchool.venue_id == venue.id
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You've already listed this school",
        )

    # Reuse an existing standing Connection for this person at this venue if
    # one's already there (e.g. someone logged them as a visit host before);
    # otherwise create one so the alumni tie shows up on the venue's page too.
    connection = db.scalar(
        select(Connection).where(
            Connection.venue_id == venue.id, Connection.name == user.name
        )
    )
    if connection is None:
        connection = Connection(
            venue_id=venue.id,
            name=user.name,
            relationship_type=HostRelationship.alumnus,
            email=user.email,
            added_by_id=user.id,
        )
        db.add(connection)
        db.flush()

    school = UserSchool(
        user_id=user.id, venue_id=venue.id, connection_id=connection.id
    )
    db.add(school)
    db.commit()
    return school


@router.delete("/me/schools/{school_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_school(school_id: int, user: CurrentUser, db: DbSession):
    school = db.get(UserSchool, school_id)
    if not school or school.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    # The auto-created Connection is left in place — it's a legitimate contact
    # record on the venue even after the user removes it from their profile.
    db.delete(school)
    db.commit()


@router.get("/directory", response_model=DirectoryUserList)
def user_directory(
    db: DbSession,
    user: CurrentUser,
    q: str | None = None,
    venue_id: int | None = None,
    language: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    if not user.is_admin and not user_directory_visible(db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The member directory isn't enabled for this community",
        )

    query = select(User).where(User.is_active.is_(True))
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(User.name.ilike(pattern))
    if language:
        query = query.where(User.languages_spoken.any(language))
    if venue_id:
        query = query.where(
            User.id.in_(select(UserSchool.user_id).where(UserSchool.venue_id == venue_id))
        )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    # Page the user IDs first, then eager-load schools for just that page —
    # joining a to-many relationship before LIMIT/OFFSET would paginate over
    # fanned-out (user, school) rows instead of distinct users.
    page_users = db.scalars(
        query.order_by(User.name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    users = db.scalars(
        select(User)
        .where(User.id.in_([u.id for u in page_users]))
        .options(joinedload(User.schools).joinedload(UserSchool.venue))
        .order_by(User.name)
    ).unique().all()
    items = [
        DirectoryUserOut(
            id=u.id,
            name=u.name,
            affiliation=u.affiliation,
            position=u.position,
            orcid=u.orcid,
            languages_spoken=u.languages_spoken,
            schools=[s.venue for s in u.schools],
        )
        for u in users
    ]
    return DirectoryUserList(items=items, total=total, page=page, page_size=page_size)


@router.get("/{user_id}/profile", response_model=UserProfileOut)
def user_profile(user_id: int, user: CurrentUser, db: DbSession):
    """Another member's profile and their events (#16). Available when the
    member directory is enabled (admins always). Carries no private fields."""
    if not user.is_admin and not user_directory_visible(db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The member directory isn't enabled for this community",
        )
    target = db.get(
        User,
        user_id,
        options=[joinedload(User.schools).joinedload(UserSchool.venue)],
    )
    if not target or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    visits = db.scalars(
        select(Visit)
        .where(Visit.author_id == user_id)
        .options(joinedload(Visit.venue))
        .order_by(Visit.visit_date.desc(), Visit.id.desc())
        .limit(500)
    ).all()
    return UserProfileOut(
        id=target.id,
        name=target.name,
        affiliation=target.affiliation,
        position=target.position,
        orcid=target.orcid,
        languages_spoken=target.languages_spoken,
        schools=[s.venue for s in target.schools],
        total_visits=len(visits),
        total_people_reached=sum(v.people_reached for v in visits),
        visits=[
            ProfileVisit(
                id=v.id,
                visit_date=v.visit_date,
                status=v.status,
                title=v.title,
                event_type=v.event_type,
                audience_level=v.audience_level,
                venue_name=v.venue.name,
                venue_city=v.venue.city,
                people_reached=v.people_reached,
            )
            for v in visits
        ],
    )
