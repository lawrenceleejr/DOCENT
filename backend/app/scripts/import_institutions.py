"""Import educational institutions from OpenStreetMap into the catalog.

Usage (inside the backend container):
    python -m app.scripts.import_institutions --region "Tennessee" \
        --types school,college,museum,library [--link-existing] [--replace-region]

Institutions are upserted by (source, external_id). --link-existing best-effort
links already-created venues to a catalog entry by matching name + city.
"""
import argparse
import re
import sys

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import Institution, Venue
from app.services.overpass import DEFAULT_TYPES, TYPE_TO_OSM, fetch_institutions


def _norm(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def run(region: str, types: list[str], link_existing: bool, replace_region: bool) -> int:
    print(f"Querying Overpass for {types} in {region!r}...", flush=True)
    parsed = fetch_institutions(region, types)
    print(f"Overpass returned {len(parsed)} named institutions.", flush=True)

    inserted = updated = 0
    seen_ids: list[str] = []
    with SessionLocal() as db:
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

    print(
        f"Done. inserted={inserted} updated={updated} pruned={pruned} "
        f"linked_venues={linked} total_in_region={total}",
        flush=True,
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Import institutions from OpenStreetMap.")
    parser.add_argument("--region", required=True, help='OSM admin area name, e.g. "Tennessee"')
    parser.add_argument(
        "--types",
        default=",".join(DEFAULT_TYPES),
        help=f"Comma-separated: {', '.join(TYPE_TO_OSM)} (default: {','.join(DEFAULT_TYPES)})",
    )
    parser.add_argument("--link-existing", action="store_true", help="Link venues by name+city")
    parser.add_argument(
        "--replace-region",
        action="store_true",
        help="Delete catalog rows in this region not seen in this import",
    )
    args = parser.parse_args()

    types = [t.strip() for t in args.types.split(",") if t.strip()]
    unknown = [t for t in types if t not in TYPE_TO_OSM]
    if unknown:
        parser.error(f"Unknown type(s): {unknown}. Valid: {list(TYPE_TO_OSM)}")

    return run(args.region, types, args.link_existing, args.replace_region)


if __name__ == "__main__":
    sys.exit(main())
