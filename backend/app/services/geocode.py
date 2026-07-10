"""Turn a place name / address into coordinates via OpenStreetMap Nominatim.

A raw "lat, lon" string is parsed directly (no network). Everything else is
geocoded. Kept separate from the Overpass service so the pure helpers
(parse_latlon, to_meters) are unit-testable without network access.
"""
import os
import re
from dataclasses import dataclass

import httpx

from app.config import get_settings

USER_AGENT = "DOCENT-outreach-tracker/0.1 (+https://github.com/lawrenceleejr/docent)"

_LATLON = re.compile(
    r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$"
)


@dataclass
class GeocodeResult:
    latitude: float
    longitude: float
    display_name: str


def parse_latlon(text: str) -> tuple[float, float] | None:
    """Parse 'lat, lon' into coordinates, validating ranges; else None."""
    m = _LATLON.match(text)
    if not m:
        return None
    lat, lon = float(m.group(1)), float(m.group(2))
    if -90 <= lat <= 90 and -180 <= lon <= 180:
        return lat, lon
    return None


def to_meters(radius: float, unit: str) -> float:
    """Convert a radius in km or mi to metres."""
    if unit == "mi":
        return radius * 1609.344
    return radius * 1000.0


def geocode(location: str, timeout: int = 30) -> GeocodeResult | None:
    """Resolve a location string to coordinates.

    Accepts a raw 'lat, lon' (no network) or any address/place name (Nominatim).
    Returns None if nothing matched.
    """
    coords = parse_latlon(location)
    if coords:
        return GeocodeResult(coords[0], coords[1], f"{coords[0]}, {coords[1]}")

    verify = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE") or True
    headers = {"User-Agent": USER_AGENT}
    params = {"q": location, "format": "json", "limit": 1}
    with httpx.Client(verify=verify, trust_env=True, timeout=timeout, headers=headers) as client:
        response = client.get(get_settings().nominatim_url, params=params)
    response.raise_for_status()
    results = response.json()
    if not results:
        return None
    top = results[0]
    return GeocodeResult(
        latitude=float(top["lat"]),
        longitude=float(top["lon"]),
        display_name=top.get("display_name", location),
    )
