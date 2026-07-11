import secrets

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.deps import CurrentAdmin, DbSession
from app.models import User
from app.schemas import (
    AdminUserUpdate,
    InstitutionImportRequest,
    InstitutionImportResult,
    PasswordResetResult,
    RegistrationSettings,
    RegistrationSettingsUpdate,
    UserList,
    UserOut,
)
from app.security import hash_password
from app.services.geocode import geocode, to_meters
from app.services.institution_import import upsert_institutions
from app.services.overpass import TYPE_TO_OSM, fetch_institutions_around
from app.services.settings import (
    CONTACT_EMAIL_KEY,
    INVITE_CODE_KEY,
    effective_contact_email,
    effective_invite_code,
    set_setting,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

MAX_RADIUS_M = 100_000  # 100 km (~62 mi) — keep Overpass queries bounded.


@router.get("/users", response_model=UserList)
def list_users(
    db: DbSession,
    _admin: CurrentAdmin,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    query = select(User)
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(or_(User.name.ilike(pattern), User.email.ilike(pattern)))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    users = db.scalars(
        query.order_by(User.created_at).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return UserList(items=users, total=total, page=page, page_size=page_size)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: AdminUserUpdate, admin: CurrentAdmin, db: DbSession):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == admin.id and body.is_admin is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own admin access",
        )
    if user.id == admin.id and body.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )
    if body.email is not None:
        new_email = body.email.lower()
        clash = db.scalar(
            select(User).where(User.email == new_email, User.id != user.id)
        )
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another account already uses that email",
            )
        user.email = new_email
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    db.commit()
    db.refresh(user)
    return user


@router.get("/settings", response_model=RegistrationSettings)
def get_registration_settings(db: DbSession, _admin: CurrentAdmin):
    return RegistrationSettings(
        invite_code=effective_invite_code(db),
        contact_email=effective_contact_email(db),
    )


@router.patch("/settings", response_model=RegistrationSettings)
def update_registration_settings(
    body: RegistrationSettingsUpdate, _admin: CurrentAdmin, db: DbSession
):
    if body.invite_code is not None:
        set_setting(db, INVITE_CODE_KEY, body.invite_code.strip())
    if body.contact_email is not None:
        set_setting(db, CONTACT_EMAIL_KEY, body.contact_email.strip())
    db.commit()
    return RegistrationSettings(
        invite_code=effective_invite_code(db),
        contact_email=effective_contact_email(db),
    )


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetResult)
def reset_password(user_id: int, _admin: CurrentAdmin, db: DbSession):
    """Set a random temporary password and return it once for the admin to relay.

    No email server is required; the admin shares the password out of band and
    the user changes it from their profile after logging in.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    temporary_password = secrets.token_urlsafe(9)
    user.password_hash = hash_password(temporary_password)
    db.commit()
    return PasswordResetResult(user_id=user.id, temporary_password=temporary_password)


@router.post("/institutions/import", response_model=InstitutionImportResult)
def import_institutions_radius(
    body: InstitutionImportRequest, _admin: CurrentAdmin, db: DbSession
):
    """Import institutions from OpenStreetMap within a radius of a location.

    The location is geocoded (or parsed as a raw 'lat, lon'); institutions
    within the radius are fetched from Overpass and upserted into the catalog.
    """
    unknown = [t for t in body.types if t not in TYPE_TO_OSM]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown type(s): {', '.join(unknown)}",
        )

    radius_m = to_meters(body.radius, body.unit)
    if radius_m > MAX_RADIUS_M:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Radius too large — maximum is 100 km (about 62 mi).",
        )

    try:
        location = geocode(body.location)
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Geocoding service is unavailable — try again shortly.",
        )
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Could not find that location. Try a more specific address or 'lat, lon'.",
        )

    region = f"{body.radius:g}{body.unit} of {location.display_name[:80]}"
    try:
        parsed = fetch_institutions_around(
            location.latitude, location.longitude, radius_m, body.types
        )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenStreetMap (Overpass) is unavailable or timed out — try a smaller radius.",
        )

    counts = upsert_institutions(db, parsed, region, body.link_existing, replace_region=False)
    return InstitutionImportResult(
        location=location.display_name,
        latitude=location.latitude,
        longitude=location.longitude,
        radius_km=round(radius_m / 1000, 2),
        region=region,
        **counts,
    )
