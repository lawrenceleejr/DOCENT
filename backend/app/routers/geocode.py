# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""Address/place autocomplete for the new-venue dialog, backed by Photon."""
from fastapi import APIRouter, Query

from app.deps import CurrentUser
from app.schemas import PlaceSuggestion
from app.services.photon import search_places

router = APIRouter(prefix="/api/geocode", tags=["geocode"])


@router.get("/search", response_model=list[PlaceSuggestion])
def geocode_search(
    _user: CurrentUser,
    q: str = Query(min_length=2),
    limit: int = Query(default=5, ge=1, le=10),
):
    results = search_places(q, limit=limit)
    return [
        PlaceSuggestion(
            label=r.label,
            name=r.name,
            address=r.address,
            city=r.city,
            state=r.state,
            country=r.country,
            latitude=r.latitude,
            longitude=r.longitude,
        )
        for r in results
    ]
