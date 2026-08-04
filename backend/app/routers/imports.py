# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""Parse an uploaded CSV of past events into editable drafts for the own-profile
import wizard. Parsing only — events are created one at a time through the normal
POST /api/visits path once the communicator has reviewed each draft."""
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.deps import CurrentUser
from app.schemas import ImportDraftRow, ImportParseResponse
from app.services.csv_import import MAPPABLE_FIELDS, parse_events_csv

router = APIRouter(prefix="/api/imports", tags=["imports"])

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MiB — plenty for a personal event history.


@router.post("/events/parse", response_model=ImportParseResponse)
async def parse_events(
    _user: CurrentUser,
    file: UploadFile = File(...),
    mapping: str | None = Form(default=None),
):
    content = await file.read()
    if not content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="The file is empty."
        )
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="CSV is too large (max 5 MB).",
        )

    override: dict[str, str] | None = None
    if mapping:
        try:
            parsed_override = json.loads(mapping)
            if isinstance(parsed_override, dict):
                override = {str(k): ("" if v is None else str(v)) for k, v in parsed_override.items()}
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid mapping."
            )

    parsed = parse_events_csv(content, override)
    if not parsed.columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Couldn't read any columns from that file — is it a CSV?",
        )
    return ImportParseResponse(
        format=parsed.format,
        columns=parsed.columns,
        mappable_fields=MAPPABLE_FIELDS,
        suggested_mapping=parsed.suggested_mapping,
        rows=[ImportDraftRow(**vars(row)) for row in parsed.rows],
    )
