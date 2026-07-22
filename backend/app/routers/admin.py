import json
import os
import re
import secrets
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Body, HTTPException, Query, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import joinedload

from app.deps import CurrentAdmin, DbSession
from app.models import (
    FederatedActivity,
    FederationPeer,
    Institution,
    User,
    UserSchool,
    Venue,
    Visit,
)
from app.schemas import (
    AdminUserList,
    AdminUserOut,
    AdminUserUpdate,
    BackupItem,
    BackupList,
    DbImportResult,
    FederationPeerCreate,
    FederationPeerOut,
    FederationPeerPreview,
    FederationPeerUpdate,
    InstitutionAdminItem,
    InstitutionAdminList,
    InstitutionCreate,
    InstitutionDetail,
    InstitutionImportRequest,
    InstitutionImportResult,
    InstitutionUpdate,
    PasswordResetResult,
    RegistrationSettings,
    RegistrationSettingsUpdate,
    UserMergeRequest,
    UserOut,
)
from app.security import hash_password
from app.services import dbtransfer
from app.services import federation as fed
from app.services.geocode import geocode, to_meters
from app.services.institution_import import upsert_institutions
from app.services.overpass import TYPE_TO_OSM, fetch_institutions_around
from app.services.settings import (
    CONTACT_EMAIL_KEY,
    FEDERATION_PUBLISH_KEY,
    FEDERATION_PUBLISH_PLANNED_KEY,
    INVITE_CODE_KEY,
    LOGIN_MESSAGE_KEY,
    MAP_CENTER_LAT_KEY,
    MAP_CENTER_LON_KEY,
    PUBLIC_PAGE_KEY,
    SITE_NAME_KEY,
    SITE_URL_KEY,
    USER_DIRECTORY_KEY,
    effective_contact_email,
    effective_invite_code,
    effective_login_message,
    effective_map_center_lat,
    effective_map_center_lon,
    effective_site_name,
    effective_site_url,
    ensure_federation_token,
    federation_feed_url,
    federation_publish_enabled,
    federation_publish_planned_enabled,
    public_page_enabled,
    rotate_federation_token,
    set_setting,
    user_directory_visible,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

MAX_RADIUS_M = 100_000  # 100 km (~62 mi) — keep Overpass queries bounded.
BACKUP_ROOT = Path(os.environ.get("BACKUP_ROOT", "/backups"))


@router.get("/users", response_model=AdminUserList)
def list_users(
    db: DbSession,
    _admin: CurrentAdmin,
    q: str | None = None,
    venue_id: int | None = None,
    language: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    query = select(User)
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(or_(User.name.ilike(pattern), User.email.ilike(pattern)))
    if language:
        query = query.where(User.languages_spoken.any(language))
    if venue_id:
        query = query.where(
            User.id.in_(select(UserSchool.user_id).where(UserSchool.venue_id == venue_id))
        )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    # Page user IDs first, then eager-load schools for just that page — a
    # to-many join before LIMIT/OFFSET would paginate over fanned-out rows.
    page_users = db.scalars(
        query.order_by(User.created_at).offset((page - 1) * page_size).limit(page_size)
    ).all()
    users = db.scalars(
        select(User)
        .where(User.id.in_([u.id for u in page_users]))
        .options(joinedload(User.schools).joinedload(UserSchool.venue))
        .order_by(User.created_at)
    ).unique().all()
    items = [
        AdminUserOut(
            **UserOut.model_validate(u).model_dump(),
            schools=[s.venue for s in u.schools],
        )
        for u in users
    ]
    return AdminUserList(items=items, total=total, page=page, page_size=page_size)


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


def _settings_out(db) -> RegistrationSettings:
    return RegistrationSettings(
        invite_code=effective_invite_code(db),
        contact_email=effective_contact_email(db),
        site_url=effective_site_url(db),
        site_name=effective_site_name(db),
        public_page=public_page_enabled(db),
        login_message=effective_login_message(db),
        map_center_lat=effective_map_center_lat(db),
        map_center_lon=effective_map_center_lon(db),
        user_directory_visible=user_directory_visible(db),
        federation_publish=federation_publish_enabled(db),
        federation_publish_planned=federation_publish_planned_enabled(db),
        federation_feed_url=federation_feed_url(db),
    )


@router.get("/settings", response_model=RegistrationSettings)
def get_registration_settings(db: DbSession, _admin: CurrentAdmin):
    return _settings_out(db)


@router.patch("/settings", response_model=RegistrationSettings)
def update_registration_settings(
    body: RegistrationSettingsUpdate, _admin: CurrentAdmin, db: DbSession
):
    if body.invite_code is not None:
        set_setting(db, INVITE_CODE_KEY, body.invite_code.strip())
    if body.contact_email is not None:
        set_setting(db, CONTACT_EMAIL_KEY, body.contact_email.strip())
    if body.site_url is not None:
        set_setting(db, SITE_URL_KEY, body.site_url.strip())
    if body.site_name is not None:
        set_setting(db, SITE_NAME_KEY, body.site_name.strip())
    if body.public_page is not None:
        set_setting(db, PUBLIC_PAGE_KEY, "1" if body.public_page else "")
    if body.login_message is not None:
        set_setting(db, LOGIN_MESSAGE_KEY, body.login_message.strip())
    if body.map_center_lat is not None:
        set_setting(db, MAP_CENTER_LAT_KEY, str(body.map_center_lat))
    if body.map_center_lon is not None:
        set_setting(db, MAP_CENTER_LON_KEY, str(body.map_center_lon))
    if body.user_directory_visible is not None:
        set_setting(db, USER_DIRECTORY_KEY, "1" if body.user_directory_visible else "")
    if body.federation_publish is not None:
        set_setting(db, FEDERATION_PUBLISH_KEY, "1" if body.federation_publish else "")
        # Ensure a token exists the moment publishing is turned on, so the admin
        # can immediately copy a working feed URL.
        if body.federation_publish:
            ensure_federation_token(db)
    if body.federation_publish_planned is not None:
        set_setting(
            db, FEDERATION_PUBLISH_PLANNED_KEY, "1" if body.federation_publish_planned else ""
        )
    db.commit()
    return _settings_out(db)


@router.post("/federation/rotate-token", response_model=RegistrationSettings)
def rotate_fed_token(_admin: CurrentAdmin, db: DbSession):
    """Generate a fresh federation token — invalidates any feed URL already
    handed to siblings, who must be given the new URL."""
    rotate_federation_token(db)
    db.commit()
    return _settings_out(db)


# --- Federation peers (sibling instances we pull from) ---

def _mask_feed_url(url: str) -> str:
    """Hide the token in a peer's feed URL for display."""
    return re.sub(r"(token=)[^&]+", r"\1•••", url)


def _peer_out(peer: FederationPeer) -> FederationPeerOut:
    return FederationPeerOut(
        id=peer.id,
        label=peer.label,
        feed_url=_mask_feed_url(peer.feed_url),
        interval=peer.interval,
        enabled=peer.enabled,
        last_synced_at=peer.last_synced_at,
        next_sync_at=fed.next_sync_at(peer),
        last_status=peer.last_status,
        last_error=peer.last_error,
        consecutive_failures=peer.consecutive_failures,
        activity_count=peer.activity_count,
        created_at=peer.created_at,
    )


def _get_peer_or_404(peer_id: int, db) -> FederationPeer:
    peer = db.get(FederationPeer, peer_id)
    if not peer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Peer not found")
    return peer


@router.get("/federation/peers", response_model=list[FederationPeerOut])
def list_federation_peers(db: DbSession, _admin: CurrentAdmin):
    peers = db.scalars(select(FederationPeer).order_by(FederationPeer.created_at)).all()
    return [_peer_out(p) for p in peers]


@router.post("/federation/peers/preview", response_model=FederationPeerPreview)
def preview_federation_peer(body: FederationPeerCreate, _admin: CurrentAdmin):
    """Probe a feed URL before adding it — validates the token and shows what
    the peer publishes, without creating anything."""
    url = body.feed_url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        return FederationPeerPreview(ok=False, error="URL must start with http:// or https://")
    try:
        envelope = fed.fetch_peer(url)
    except Exception as exc:  # noqa: BLE001 — report the failure to the admin
        return FederationPeerPreview(ok=False, error=str(exc)[:500])
    return FederationPeerPreview(
        ok=True,
        instance_name=envelope.get("instance_name"),
        instance_url=envelope.get("instance_url"),
        activity_count=len(envelope.get("activities") or []),
    )


@router.post("/federation/peers", response_model=FederationPeerOut, status_code=201)
def add_federation_peer(body: FederationPeerCreate, _admin: CurrentAdmin, db: DbSession):
    url = body.feed_url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Feed URL must start with http:// or https://",
        )
    peer = FederationPeer(feed_url=url, interval=body.interval)
    db.add(peer)
    db.commit()
    db.refresh(peer)
    fed.sync_peer(db, peer, force_full=True)  # first pull: full reconcile
    db.refresh(peer)
    return _peer_out(peer)


@router.patch("/federation/peers/{peer_id}", response_model=FederationPeerOut)
def update_federation_peer(
    peer_id: int, body: FederationPeerUpdate, _admin: CurrentAdmin, db: DbSession
):
    peer = _get_peer_or_404(peer_id, db)
    if body.label is not None:
        peer.label = body.label.strip() or None
    if body.interval is not None:
        peer.interval = body.interval
    if body.enabled is not None:
        peer.enabled = body.enabled
    db.commit()
    db.refresh(peer)
    return _peer_out(peer)


@router.delete("/federation/peers/{peer_id}", status_code=204)
def delete_federation_peer(peer_id: int, _admin: CurrentAdmin, db: DbSession):
    peer = db.get(FederationPeer, peer_id)
    if peer:
        db.delete(peer)  # cascades cached activities
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/federation/peers/{peer_id}/sync", response_model=FederationPeerOut)
def sync_federation_peer(peer_id: int, _admin: CurrentAdmin, db: DbSession):
    peer = _get_peer_or_404(peer_id, db)
    fed.sync_peer(db, peer, force_full=True)
    db.refresh(peer)
    return _peer_out(peer)


@router.post("/federation/sync", response_model=list[FederationPeerOut])
def sync_all_federation_peers(_admin: CurrentAdmin, db: DbSession):
    peers = db.scalars(select(FederationPeer)).all()
    for peer in peers:
        fed.sync_peer(db, peer, force_full=True)
    refreshed = db.scalars(select(FederationPeer).order_by(FederationPeer.created_at)).all()
    return [_peer_out(p) for p in refreshed]


@router.get("/db/export")
def export_database(db: DbSession, _admin: CurrentAdmin):
    """Download all outreach data as a portable JSON file (institutions,
    venues, visits, and their authors). For moving/merging between instances."""
    payload = dbtransfer.export_data(db)
    body = json.dumps(payload, indent=2).encode("utf-8")
    filename = f"docent-data-{date.today().strftime('%Y%m%d')}.json"
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/db/import", response_model=DbImportResult)
def import_database(_admin: CurrentAdmin, db: DbSession, payload: dict[str, Any] = Body(...)):
    """Merge a previously exported JSON file into this database. Idempotent:
    existing users/venues/institutions/visits are matched by natural key and
    left untouched, so re-importing never duplicates."""
    try:
        counts = dbtransfer.import_data(db, payload)
    except dbtransfer.ImportError_ as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return DbImportResult(**counts)


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


# --------------------------------------------------------------------------- #
# User merge / delete
# --------------------------------------------------------------------------- #

@router.post("/users/{user_id}/merge", response_model=UserOut)
def merge_user(user_id: int, body: UserMergeRequest, admin: CurrentAdmin, db: DbSession):
    """Reassign a user's visits & created venues to another account, then delete
    the now-empty source account. For de-duplicating accounts."""
    if user_id == body.into_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pick a different target account")
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot merge your own account")
    source = db.get(User, user_id)
    target = db.get(User, body.into_id)
    if not source or not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db.execute(update(Visit).where(Visit.author_id == user_id).values(author_id=body.into_id))
    db.execute(update(Venue).where(Venue.created_by_id == user_id).values(created_by_id=body.into_id))
    # Reassign "schools attended" too, dropping any that would collide with
    # one the target already has (uq_user_school) — otherwise deleting the
    # source account would silently lose them.
    target_venue_ids = {
        row[0]
        for row in db.execute(
            select(UserSchool.venue_id).where(UserSchool.user_id == body.into_id)
        )
    }
    db.execute(
        delete(UserSchool).where(
            UserSchool.user_id == user_id, UserSchool.venue_id.in_(target_venue_ids)
        )
    )
    db.execute(
        update(UserSchool).where(UserSchool.user_id == user_id).values(user_id=body.into_id)
    )
    db.delete(source)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: CurrentAdmin, db: DbSession):
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    visit_count = db.scalar(select(func.count(Visit.id)).where(Visit.author_id == user_id)) or 0
    if visit_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This user has {visit_count} visit(s). Merge them into another "
                "account first (which reassigns the visits), then delete."
            ),
        )
    db.execute(update(Venue).where(Venue.created_by_id == user_id).values(created_by_id=None))
    db.delete(user)
    db.commit()


# --------------------------------------------------------------------------- #
# Institution catalog management
# --------------------------------------------------------------------------- #

@router.get("/institutions", response_model=InstitutionAdminList)
def admin_list_institutions(
    db: DbSession,
    _admin: CurrentAdmin,
    q: str | None = None,
    region: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    query = select(Institution)
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(or_(Institution.name.ilike(pattern), Institution.city.ilike(pattern)))
    if region:
        query = query.where(Institution.region == region)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.order_by(Institution.name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return InstitutionAdminList(items=items, total=total, page=page, page_size=page_size)


@router.get("/institutions/regions")
def admin_institution_regions(db: DbSession, _admin: CurrentAdmin):
    rows = db.execute(
        select(Institution.region, func.count(Institution.id))
        .group_by(Institution.region)
        .order_by(func.count(Institution.id).desc())
    ).all()
    return [{"region": r or "(none)", "count": c} for r, c in rows]


@router.post("/institutions", response_model=InstitutionDetail, status_code=status.HTTP_201_CREATED)
def admin_create_institution(body: InstitutionCreate, _admin: CurrentAdmin, db: DbSession):
    """Manually add an institution the OSM importer can't find (e.g. a school
    OSM only tags as a building). Give coordinates, or a location to geocode."""
    lat, lon = body.latitude, body.longitude
    if lat is None or lon is None:
        if not body.location:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide coordinates, or a location (address or 'lat, lon') to look up.",
            )
        try:
            loc = geocode(body.location)
        except httpx.HTTPError:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Geocoding service unavailable")
        if loc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Could not find that location")
        lat, lon = loc.latitude, loc.longitude

    inst = Institution(
        source="manual",
        external_id=secrets.token_hex(8),
        name=body.name.strip(),
        institution_type=body.institution_type,
        latitude=lat,
        longitude=lon,
        address=body.address,
        city=body.city,
        state=body.state,
        website=body.website,
        phone=body.phone,
        region=body.region.strip() or "Manual",
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


@router.post("/institutions/delete-region")
def admin_delete_institutions_by_region(
    db: DbSession, _admin: CurrentAdmin, region: str = Query(min_length=1)
):
    result = db.execute(
        Institution.__table__.delete().where(Institution.region == region)
    )
    db.commit()
    return {"deleted": result.rowcount, "region": region}


@router.patch("/institutions/{institution_id}", response_model=InstitutionDetail)
def admin_update_institution(
    institution_id: int, body: InstitutionUpdate, _admin: CurrentAdmin, db: DbSession
):
    inst = db.get(Institution, institution_id)
    if not inst:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(inst, field, value)
    db.commit()
    db.refresh(inst)
    return inst


@router.delete("/institutions/{institution_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_institution(institution_id: int, _admin: CurrentAdmin, db: DbSession):
    inst = db.get(Institution, institution_id)
    if not inst:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution not found")
    db.delete(inst)
    db.commit()


# --------------------------------------------------------------------------- #
# Backups
# --------------------------------------------------------------------------- #

@router.get("/backups", response_model=BackupList)
def list_backups(_admin: CurrentAdmin):
    items: list[BackupItem] = []
    if BACKUP_ROOT.exists():
        for p in BACKUP_ROOT.rglob("*.dump"):
            if not p.is_file():
                continue
            rel = p.relative_to(BACKUP_ROOT)
            tier = rel.parts[0] if len(rel.parts) > 1 else "other"
            st = p.stat()
            items.append(
                BackupItem(
                    path=str(rel),
                    tier=tier,
                    size_bytes=st.st_size,
                    modified_at=datetime.fromtimestamp(st.st_mtime, tz=timezone.utc),
                )
            )
    items.sort(key=lambda b: b.modified_at, reverse=True)
    return BackupList(
        items=items,
        count=len(items),
        total_size_bytes=sum(b.size_bytes for b in items),
        last_backup_at=items[0].modified_at if items else None,
    )


@router.post("/backups/run", status_code=status.HTTP_202_ACCEPTED)
def run_backup(_admin: CurrentAdmin):
    """Ask the backup sidecar to take a dump now (it polls for this sentinel)."""
    if not BACKUP_ROOT.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Backups volume is not mounted on the backend.",
        )
    (BACKUP_ROOT / ".run-now").write_text("requested\n")
    return {"requested": True}


@router.get("/backups/download")
def download_backup(_admin: CurrentAdmin, path: str = Query(min_length=1)):
    root = BACKUP_ROOT.resolve()
    target = (root / path).resolve()
    # Guard against path traversal: the resolved file must live under /backups.
    if root not in target.parents or target.suffix != ".dump" or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup not found")
    return FileResponse(
        target, filename=target.name, media_type="application/octet-stream"
    )
