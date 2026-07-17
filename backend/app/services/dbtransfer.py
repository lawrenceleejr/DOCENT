"""Portable JSON export / merge-import of DOCENT's outreach data.

This is a data-level transfer (institutions, venues, visits + the authors that
own them) meant for moving/combining data between DOCENT instances — distinct
from the byte-level `pg_dump` backups. It uses natural keys so an import can be
re-run and merged into an existing database without creating duplicates:

  users        by email
  institutions by (source, external_id)
  venues       by (name, city)
  visits       by (author, venue, visit_date, title)

Import never overwrites an existing user's credentials or admin flag, and it
never grants admin — unknown authors are created as inactive placeholders so
their authorship is preserved without opening a login.
"""
from __future__ import annotations

import secrets
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AudienceLevel,
    EventType,
    HostRelationship,
    Institution,
    InstitutionType,
    User,
    Venue,
    VenueType,
    Visit,
    VisitStatus,
)
from app.languages import LANGUAGE_SET
from app.schemas import normalize_links, normalize_tags
from app.security import hash_password

EXPORT_VERSION = 1


def export_data(db: Session) -> dict[str, Any]:
    """Serialize all outreach data to a portable, natural-keyed dict."""
    users = db.scalars(select(User)).all()
    institutions = db.scalars(select(Institution)).all()
    venues = db.scalars(select(Venue)).all()
    visits = db.scalars(select(Visit)).all()

    inst_by_id = {i.id: i for i in institutions}
    user_by_id = {u.id: u for u in users}
    venue_by_id = {v.id: v for v in venues}

    def inst_key(inst: Institution | None) -> dict[str, str] | None:
        if inst is None:
            return None
        return {"source": inst.source, "external_id": inst.external_id}

    return {
        "docent_export_version": EXPORT_VERSION,
        "users": [
            {
                "email": u.email,
                "name": u.name,
                "affiliation": u.affiliation,
                "is_admin": u.is_admin,
            }
            for u in users
        ],
        "institutions": [
            {
                "source": i.source,
                "external_id": i.external_id,
                "name": i.name,
                "institution_type": i.institution_type.value,
                "latitude": i.latitude,
                "longitude": i.longitude,
                "address": i.address,
                "city": i.city,
                "state": i.state,
                "country": i.country,
                "website": i.website,
                "phone": i.phone,
                "region": i.region,
            }
            for i in institutions
        ],
        "venues": [
            {
                "name": v.name,
                "city": v.city,
                "venue_type": v.venue_type.value,
                "address": v.address,
                "state": v.state,
                "country": v.country,
                "latitude": v.latitude,
                "longitude": v.longitude,
                "notes": v.notes,
                "institution": inst_key(inst_by_id.get(v.institution_id)),
            }
            for v in venues
        ],
        "visits": [
            {
                "author_email": user_by_id[v.author_id].email,
                "venue": {
                    "name": venue_by_id[v.venue_id].name,
                    "city": venue_by_id[v.venue_id].city,
                },
                "status": v.status.value,
                "visit_date": v.visit_date.isoformat(),
                "start_time": v.start_time.strftime("%H:%M") if v.start_time else None,
                "event_type": v.event_type.value,
                "title": v.title,
                "description": v.description,
                "contact_name": v.contact_name,
                "contact_email": v.contact_email,
                "contact_phone": v.contact_phone,
                "host_role": v.host_role,
                "host_relationship": (
                    v.host_relationship.value if v.host_relationship else None
                ),
                "host_relationship_detail": v.host_relationship_detail,
                "host_notes": v.host_notes,
                "people_reached": v.people_reached,
                "audience_level": v.audience_level.value,
                "language": v.language,
                "duration_minutes": v.duration_minutes,
                "rating": v.rating,
                "reflection": v.reflection,
                "follow_up_planned": v.follow_up_planned,
                "additional_presenters": v.additional_presenters,
                "tags": list(v.tags or []),
                "links": list(v.links or []),
            }
            for v in visits
        ],
    }


class ImportError_(ValueError):
    """Raised when the payload isn't a recognizable DOCENT export."""


def import_data(db: Session, payload: dict[str, Any]) -> dict[str, int]:
    """Merge an exported payload into the current database (idempotent)."""
    if not isinstance(payload, dict) or "docent_export_version" not in payload:
        raise ImportError_("Not a DOCENT export file (missing version marker).")

    counts = {
        "users_created": 0,
        "institutions_created": 0,
        "venues_created": 0,
        "visits_created": 0,
        "visits_skipped": 0,
    }

    # --- users (by email) ---
    users: dict[str, User] = {u.email: u for u in db.scalars(select(User)).all()}
    for row in payload.get("users", []):
        email = (row.get("email") or "").strip().lower()
        if not email or email in users:
            continue
        user = User(
            email=email,
            name=row.get("name") or email,
            affiliation=row.get("affiliation"),
            password_hash=hash_password(secrets.token_urlsafe(32)),
            is_admin=False,  # never grant admin via import
            is_active=False,  # placeholder — no login until an admin enables it
        )
        db.add(user)
        users[email] = user
        counts["users_created"] += 1

    # --- institutions (by source+external_id) ---
    institutions: dict[tuple[str, str], Institution] = {
        (i.source, i.external_id): i for i in db.scalars(select(Institution)).all()
    }
    for row in payload.get("institutions", []):
        key = (row.get("source") or "osm", row.get("external_id") or "")
        if not key[1] or key in institutions:
            continue
        inst = Institution(
            source=key[0],
            external_id=key[1],
            name=row["name"],
            institution_type=InstitutionType(row["institution_type"]),
            latitude=row["latitude"],
            longitude=row["longitude"],
            address=row.get("address"),
            city=row.get("city"),
            state=row.get("state"),
            country=row.get("country"),
            website=row.get("website"),
            phone=row.get("phone"),
            region=row.get("region"),
        )
        db.add(inst)
        institutions[key] = inst
        counts["institutions_created"] += 1

    db.flush()  # assign ids so venues can reference institutions

    # --- venues (by name+city) ---
    venues: dict[tuple[str, str | None], Venue] = {
        (v.name, v.city): v for v in db.scalars(select(Venue)).all()
    }
    for row in payload.get("venues", []):
        key = (row["name"], row.get("city"))
        if key in venues:
            continue
        inst_ref = row.get("institution")
        inst = (
            institutions.get((inst_ref["source"], inst_ref["external_id"]))
            if inst_ref
            else None
        )
        venue = Venue(
            name=row["name"],
            city=row.get("city"),
            venue_type=VenueType(row["venue_type"]),
            address=row.get("address"),
            state=row.get("state"),
            country=row.get("country") or "USA",
            latitude=row.get("latitude"),
            longitude=row.get("longitude"),
            notes=row.get("notes"),
            institution_id=inst.id if inst else None,
        )
        db.add(venue)
        venues[key] = venue
        counts["venues_created"] += 1

    db.flush()  # assign venue/user ids for visit FKs

    # --- visits (by author+venue+date+title) ---
    existing_visits: set[tuple[int, int, date, str]] = {
        (v.author_id, v.venue_id, v.visit_date, v.title)
        for v in db.scalars(select(Visit)).all()
    }
    for row in payload.get("visits", []):
        author = users.get((row.get("author_email") or "").strip().lower())
        venue = venues.get((row["venue"]["name"], row["venue"].get("city")))
        if author is None or venue is None:
            counts["visits_skipped"] += 1
            continue
        visit_date = date.fromisoformat(row["visit_date"])
        sig = (author.id, venue.id, visit_date, row["title"])
        if sig in existing_visits:
            counts["visits_skipped"] += 1
            continue
        rel = row.get("host_relationship")
        start = row.get("start_time")
        visit = Visit(
            author_id=author.id,
            venue_id=venue.id,
            status=VisitStatus(row.get("status", "completed")),
            visit_date=visit_date,
            start_time=time.fromisoformat(start) if start else None,
            event_type=EventType(row["event_type"]),
            title=row["title"],
            description=row.get("description"),
            contact_name=row.get("contact_name"),
            contact_email=row.get("contact_email"),
            contact_phone=row.get("contact_phone"),
            host_role=row.get("host_role"),
            host_relationship=HostRelationship(rel) if rel else None,
            host_relationship_detail=row.get("host_relationship_detail"),
            host_notes=row.get("host_notes"),
            people_reached=row.get("people_reached", 0),
            audience_level=AudienceLevel(row["audience_level"]),
            language=row.get("language") if row.get("language") in LANGUAGE_SET else None,
            duration_minutes=row.get("duration_minutes"),
            rating=row.get("rating"),
            reflection=row.get("reflection"),
            follow_up_planned=row.get("follow_up_planned", False),
            additional_presenters=row.get("additional_presenters"),
            tags=normalize_tags(row.get("tags")),
            links=normalize_links(row.get("links")),
        )
        db.add(visit)
        existing_visits.add(sig)
        counts["visits_created"] += 1

    db.commit()
    return counts
