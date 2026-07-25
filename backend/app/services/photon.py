# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""Address/place autocomplete via Photon (photon.komoot.io) — a free, keyless,
OSM-based geocoder built specifically for type-ahead search. Nominatim's
/search (used elsewhere for one-shot geocoding) isn't meant for a request per
keystroke; Photon is. Powers the "search as you type" field in the new-venue
dialog. The fetch and parse are kept separate so parsing is unit-testable
against a fixed payload without network access.
"""
import os
from dataclasses import dataclass

import httpx

from app.config import get_settings

USER_AGENT = "DOCENT-outreach-tracker/0.1 (+https://github.com/lawrenceleejr/docent)"


@dataclass
class PlaceSuggestion:
    label: str
    name: str | None
    address: str | None
    city: str | None
    state: str | None
    country: str | None
    latitude: float
    longitude: float


def _display_label(name: str | None, city: str | None, state: str | None) -> str:
    parts = [p for p in (name, city, state) if p]
    return ", ".join(parts) if parts else "Unnamed place"


def parse_photon_response(data: dict) -> list[PlaceSuggestion]:
    """Turn a Photon GeoJSON FeatureCollection into place suggestions."""
    suggestions = []
    for feature in data.get("features", []):
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates")
        if not coords or len(coords) < 2:
            continue
        # GeoJSON order is [lon, lat] — the opposite of everywhere else in DOCENT.
        longitude, latitude = coords[0], coords[1]

        props = feature.get("properties") or {}
        name = props.get("name")
        street = props.get("street")
        housenumber = props.get("housenumber")
        address = " ".join(p for p in (housenumber, street) if p) or None
        city = props.get("city")
        state = props.get("state")
        country = props.get("country")

        suggestions.append(
            PlaceSuggestion(
                label=_display_label(name, city, state),
                name=name,
                address=address,
                city=city,
                state=state,
                country=country,
                latitude=latitude,
                longitude=longitude,
            )
        )
    return suggestions


def search_places(query: str, limit: int = 5, timeout: int = 10) -> list[PlaceSuggestion]:
    """Query Photon for place suggestions matching free-text input."""
    verify = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE") or True
    headers = {"User-Agent": USER_AGENT}
    params = {"q": query, "limit": limit}
    with httpx.Client(verify=verify, trust_env=True, timeout=timeout, headers=headers) as client:
        response = client.get(get_settings().photon_url, params=params)
    response.raise_for_status()
    return parse_photon_response(response.json())
