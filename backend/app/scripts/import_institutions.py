"""Import educational institutions from OpenStreetMap into the catalog.

Usage (inside the backend container):
    python -m app.scripts.import_institutions --region "Tennessee" \
        --types school,college,museum,library [--link-existing] [--replace-region]

Institutions are upserted by (source, external_id). --link-existing best-effort
links already-created venues to a catalog entry by matching name + city.
"""
import argparse
import sys

from app.database import SessionLocal
from app.services.institution_import import upsert_institutions
from app.services.overpass import DEFAULT_TYPES, TYPE_TO_OSM, fetch_institutions


def run(region: str, types: list[str], link_existing: bool, replace_region: bool) -> int:
    print(f"Querying Overpass for {types} in {region!r}...", flush=True)
    parsed = fetch_institutions(region, types)
    print(f"Overpass returned {len(parsed)} named institutions.", flush=True)

    with SessionLocal() as db:
        counts = upsert_institutions(db, parsed, region, link_existing, replace_region)

    print(
        f"Done. inserted={counts['inserted']} updated={counts['updated']} "
        f"pruned={counts['pruned']} linked_venues={counts['linked_venues']} "
        f"total_in_region={counts['total_in_region']}",
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
