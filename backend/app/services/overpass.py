"""Import educational institutions from OpenStreetMap via the Overpass API.

The fetch and the parse are kept separate so parsing can be unit-tested against
a fixed JSON payload without any network access.
"""
import os
from dataclasses import dataclass

import httpx

from app.config import get_settings
from app.models import InstitutionType

# OSM tag -> our coarse InstitutionType. Schools in OSM (amenity=school) don't
# reliably encode grade level, so everything K-12 collapses to "school".
_TAG_TO_TYPE: dict[tuple[str, str], InstitutionType] = {
    ("amenity", "school"): InstitutionType.school,
    ("amenity", "college"): InstitutionType.college,
    ("amenity", "university"): InstitutionType.university,
    ("amenity", "library"): InstitutionType.library,
    ("tourism", "museum"): InstitutionType.museum,
}

# Friendly type name -> the OSM (key, value) filters that Overpass should fetch.
TYPE_TO_OSM: dict[str, list[tuple[str, str]]] = {
    "school": [("amenity", "school")],
    "college": [("amenity", "college")],
    "university": [("amenity", "university")],
    "library": [("amenity", "library")],
    "museum": [("tourism", "museum")],
}

DEFAULT_TYPES = ["school", "college", "museum", "library"]


@dataclass
class ParsedInstitution:
    source: str
    external_id: str
    name: str
    institution_type: InstitutionType
    latitude: float
    longitude: float
    address: str | None
    city: str | None
    state: str | None
    country: str | None
    website: str | None
    phone: str | None


def build_query(region: str, types: list[str], timeout: int = 180) -> str:
    """Build Overpass QL for all requested types within a named admin area."""
    selectors = []
    for t in types:
        for key, value in TYPE_TO_OSM[t]:
            for element in ("node", "way", "relation"):
                selectors.append(f'  {element}["{key}"="{value}"](area.a);')
    body = "\n".join(selectors)
    # admin_level 4 = state/province in the US (and most countries).
    return (
        f"[out:json][timeout:{timeout}];\n"
        f'area["name"="{region}"]["admin_level"="4"]->.a;\n'
        f"(\n{body}\n);\n"
        "out center tags;"
    )


def _addr(tags: dict) -> str | None:
    parts = [tags.get("addr:housenumber"), tags.get("addr:street")]
    line = " ".join(p for p in parts if p)
    return line or None


def parse_elements(elements: list[dict]) -> list[ParsedInstitution]:
    """Turn raw Overpass elements into ParsedInstitution rows.

    Skips anything without a name or without resolvable coordinates. Ways and
    relations carry their centroid under a `center` key (from `out center`).
    """
    out: list[ParsedInstitution] = []
    for el in elements:
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue

        if "lat" in el and "lon" in el:
            lat, lon = el["lat"], el["lon"]
        elif "center" in el:
            lat, lon = el["center"].get("lat"), el["center"].get("lon")
        else:
            continue
        if lat is None or lon is None:
            continue

        itype = None
        for key, value in _TAG_TO_TYPE:
            if tags.get(key) == value:
                itype = _TAG_TO_TYPE[(key, value)]
                break
        if itype is None:
            itype = InstitutionType.other

        out.append(
            ParsedInstitution(
                source="osm",
                external_id=f"{el['type']}/{el['id']}",
                name=name.strip()[:255],
                institution_type=itype,
                latitude=float(lat),
                longitude=float(lon),
                address=_addr(tags),
                city=tags.get("addr:city"),
                state=tags.get("addr:state"),
                country=tags.get("addr:country"),
                website=(tags.get("website") or tags.get("contact:website")),
                phone=(tags.get("phone") or tags.get("contact:phone")),
            )
        )
    return out


def fetch_institutions(region: str, types: list[str], timeout: int = 300) -> list[ParsedInstitution]:
    """Query Overpass for a region and return parsed institutions."""
    query = build_query(region, types)
    url = get_settings().overpass_url
    # Honor a custom CA bundle (corporate/TLS-inspecting proxies); default to
    # normal verification. trust_env picks up HTTP(S)_PROXY from the environment.
    verify = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE") or True
    headers = {
        "User-Agent": "DOCENT-outreach-tracker/0.1 (+https://github.com/lawrenceleejr/docent)",
        "Accept": "application/json",
    }
    with httpx.Client(verify=verify, trust_env=True, timeout=timeout, headers=headers) as client:
        response = client.post(url, data={"data": query})
    response.raise_for_status()
    return parse_elements(response.json().get("elements", []))
