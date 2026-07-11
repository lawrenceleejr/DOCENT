"""Shared upsert for imported institutions — used by the CLI and the admin API."""
import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Institution, Venue
from app.services.overpass import ParsedInstitution


def _norm(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def upsert_institutions(
    db: Session,
    parsed: list[ParsedInstitution],
    region: str,
    link_existing: bool = False,
    replace_region: bool = False,
) -> dict[str, int]:
    """Upsert parsed institutions under a region label; return counts.

    `region` is a grouping label (a state name, or e.g. "25mi of Knoxville").
    """
    inserted = updated = 0
    seen_ids: list[str] = []
    for p in parsed:
        seen_ids.append(p.external_id)
        existing = db.scalar(
            select(Institution).where(
                Institution.source == p.source,
                Institution.external_id == p.external_id,
            )
        )
        if existing:
            existing.name = p.name
            existing.institution_type = p.institution_type
            existing.latitude = p.latitude
            existing.longitude = p.longitude
            existing.address = p.address
            existing.city = p.city
            existing.state = p.state
            existing.country = p.country
            existing.website = p.website
            existing.phone = p.phone
            existing.region = region
            updated += 1
        else:
            db.add(
                Institution(
                    source=p.source,
                    external_id=p.external_id,
                    name=p.name,
                    institution_type=p.institution_type,
                    latitude=p.latitude,
                    longitude=p.longitude,
                    address=p.address,
                    city=p.city,
                    state=p.state,
                    country=p.country,
                    website=p.website,
                    phone=p.phone,
                    region=region,
                )
            )
            inserted += 1

    pruned = 0
    if replace_region and seen_ids:
        stale = db.scalars(
            select(Institution).where(
                Institution.region == region,
                Institution.external_id.notin_(seen_ids),
            )
        ).all()
        for inst in stale:
            db.delete(inst)
        pruned = len(stale)

    db.commit()

    linked = 0
    if link_existing:
        institutions = db.scalars(
            select(Institution).where(Institution.region == region)
        ).all()
        by_key = {(_norm(i.name), _norm(i.city)): i for i in institutions}
        venues = db.scalars(select(Venue).where(Venue.institution_id.is_(None))).all()
        for venue in venues:
            match = by_key.get((_norm(venue.name), _norm(venue.city)))
            if match:
                venue.institution_id = match.id
                linked += 1
        db.commit()

    total = db.scalar(
        select(func.count()).select_from(Institution).where(Institution.region == region)
    )
    return {
        "inserted": inserted,
        "updated": updated,
        "pruned": pruned,
        "linked_venues": linked,
        "total_in_region": total or 0,
    }
