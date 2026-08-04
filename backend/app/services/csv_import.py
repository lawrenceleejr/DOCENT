# DOCENT — Distributed Outreach & Community Engagement Network Tracker
# Copyright (C) 2026 Lawrence Lee
# Licensed under the GNU General Public License v3.0 or later. See LICENSE.
"""Parse an uploaded CSV of past events into editable draft events.

Deliberately forgiving: it accepts an arbitrary CSV (sniffing the delimiter and
encoding), auto-maps common column names onto our event fields, and additionally
recognises a Symplectic Elements export. Nothing here writes to the DB — it only
produces *drafts* the communicator reviews, edits, and creates one at a time in
the import wizard, so a best-effort guess that's slightly off is harmless.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from app.models import AudienceLevel, EventType

# The event fields we try to fill from CSV columns. `venue_name`/`venue_city`
# only seed the venue picker — the communicator still picks/creates the venue.
MAPPABLE_FIELDS = [
    "title",
    "date",
    "event_type",
    "venue_name",
    "venue_city",
    "people_reached",
    "audience_level",
    "description",
    "start_time",
    "duration_minutes",
    "language",
    "presenters",
    "url",
]

# Lower-cased, punctuation-stripped header text -> our field. First hit wins, and
# more-specific aliases (e.g. "audience size") are checked before looser ones.
_HEADER_ALIASES: dict[str, str] = {
    "title": "title",
    "event title": "title",
    "event name": "title",
    "activity title": "title",
    "presentation title": "title",
    "talk title": "title",
    "name": "title",
    "event": "title",
    "activity": "title",
    "subject": "title",
    "reporting date": "date",
    "event date": "date",
    "start date": "date",
    "activity date": "date",
    "date of event": "date",
    "date": "date",
    "start": "date",
    "when": "date",
    "day": "date",
    "event type": "event_type",
    "activity type": "event_type",
    "type": "event_type",
    "category": "event_type",
    "kind": "event_type",
    "venue name": "venue_name",
    "host institution": "venue_name",
    "venue": "venue_name",
    "location": "venue_name",
    "place": "venue_name",
    "institution": "venue_name",
    "organisation": "venue_name",
    "organization": "venue_name",
    "school": "venue_name",
    "city": "venue_city",
    "town": "venue_city",
    "audience size": "people_reached",
    "number of attendees": "people_reached",
    "no of attendees": "people_reached",
    "number reached": "people_reached",
    "people reached": "people_reached",
    "attendance": "people_reached",
    "attendees": "people_reached",
    "participants": "people_reached",
    "headcount": "people_reached",
    "audience level": "audience_level",
    "audience type": "audience_level",
    "audience": "audience_level",
    "level": "audience_level",
    "description": "description",
    "abstract": "description",
    "summary": "description",
    "details": "description",
    "notes": "description",
    "comments": "description",
    "start time": "start_time",
    "time": "start_time",
    "duration minutes": "duration_minutes",
    "duration": "duration_minutes",
    "length": "duration_minutes",
    "language": "language",
    "co presenters": "presenters",
    "additional presenters": "presenters",
    "presenters": "presenters",
    "speakers": "presenters",
    "authors": "presenters",
    "url": "url",
    "link": "url",
    "website": "url",
    "web address": "url",
}

# Headers that, taken together, mark a Symplectic Elements export (which is a
# UK-origin tool, so its ambiguous d/m/y dates are read day-first).
_SYMPLECTIC_MARKERS = {
    "reporting date",
    "data source",
    "data source proprietary id",
    "favourite",
    "c-reporting-date",
    "reporting date 1",
}

# Keyword -> EventType, checked in order (first substring match wins).
_EVENT_TYPE_KEYWORDS: list[tuple[str, EventType]] = [
    ("classroom", EventType.classroom_visit),
    ("class visit", EventType.classroom_visit),
    ("school visit", EventType.classroom_visit),
    ("science fair", EventType.science_fair),
    ("colloquium", EventType.colloquium),
    ("seminar", EventType.seminar),
    ("conference", EventType.conference),
    ("public lecture", EventType.public_lecture),
    ("public talk", EventType.public_lecture),
    ("lecture", EventType.public_lecture),
    ("invited talk", EventType.public_lecture),
    ("keynote", EventType.public_lecture),
    ("talk", EventType.public_lecture),
    ("lab tour", EventType.lab_tour),
    ("tour", EventType.lab_tour),
    ("career", EventType.career_day),
    ("demo", EventType.demo_booth),
    ("booth", EventType.demo_booth),
    ("outreach stand", EventType.demo_booth),
    ("workshop", EventType.workshop),
    ("interview", EventType.interview),
    ("podcast", EventType.interview),
    ("radio", EventType.interview),
]

_AUDIENCE_KEYWORDS: list[tuple[str, AudienceLevel]] = [
    ("elementary", AudienceLevel.elementary),
    ("primary", AudienceLevel.elementary),
    ("middle", AudienceLevel.middle_school),
    ("high school", AudienceLevel.high_school),
    ("secondary", AudienceLevel.high_school),
    ("community college", AudienceLevel.community_college),
    ("undergrad", AudienceLevel.undergraduate),
    ("graduate", AudienceLevel.graduate),
    ("postgrad", AudienceLevel.graduate),
    ("educator", AudienceLevel.educators),
    ("teacher", AudienceLevel.educators),
    ("public", AudienceLevel.general_public),
    ("general", AudienceLevel.general_public),
    ("mixed", AudienceLevel.mixed),
]

# Date formats we try in order. Slash/dot dates are handled separately so we can
# disambiguate day-first vs month-first; these cover the unambiguous shapes.
_DATE_FORMATS = [
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%Y.%m.%d",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d %Y",
    "%B %d %Y",
    "%d-%b-%Y",
    "%d-%B-%Y",
    "%b %d, %Y",
    "%B %d, %Y",
    "%d %b, %Y",
    "%d %B, %Y",
    "%Y%m%d",
]


def _norm_header(h: str) -> str:
    """Lower-case a header and collapse punctuation/space so 'No. of Attendees'
    and 'number of attendees' compare equal."""
    return re.sub(r"[^a-z0-9]+", " ", h.strip().lower()).strip()


@dataclass
class DraftEvent:
    index: int
    raw: dict[str, str]
    title: str | None = None
    visit_date: str | None = None  # ISO yyyy-mm-dd
    date_raw: str | None = None
    event_type: str | None = None
    audience_level: str | None = None
    people_reached: int | None = None
    venue_name: str | None = None
    venue_city: str | None = None
    description: str | None = None
    start_time: str | None = None  # HH:MM
    duration_minutes: int | None = None
    language: str | None = None
    presenters: str | None = None
    url: str | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class ParsedCsv:
    format: str  # "symplectic" | "generic"
    columns: list[str]
    suggested_mapping: dict[str, str]  # field -> column header
    rows: list[DraftEvent]


def _decode(content: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _read_rows(text: str) -> tuple[list[str], list[dict[str, str]]]:
    # Sniff the delimiter from a sample; default to comma when the sniffer is
    # unsure (single-column files make it raise).
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    all_rows = [r for r in reader if any(c.strip() for c in r)]
    if not all_rows:
        return [], []
    headers = [h.strip() for h in all_rows[0]]
    # De-duplicate blank/again headers so every column has a stable key.
    seen: dict[str, int] = {}
    cols: list[str] = []
    for i, h in enumerate(headers):
        name = h or f"Column {i + 1}"
        if name in seen:
            seen[name] += 1
            name = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
        cols.append(name)
    rows = []
    for raw in all_rows[1:]:
        row = {cols[i]: (raw[i].strip() if i < len(raw) else "") for i in range(len(cols))}
        rows.append(row)
    return cols, rows


def detect_format(columns: list[str]) -> str:
    normed = {_norm_header(c) for c in columns}
    if normed & _SYMPLECTIC_MARKERS:
        return "symplectic"
    return "generic"


def suggest_mapping(columns: list[str]) -> dict[str, str]:
    """Best column for each field. A field keeps the first column that maps to
    it, so left-most/more-canonical columns win."""
    mapping: dict[str, str] = {}
    for col in columns:
        field_name = _HEADER_ALIASES.get(_norm_header(col))
        if field_name and field_name not in mapping:
            mapping[field_name] = col
    return mapping


def guess_event_type(value: str | None) -> str | None:
    if not value:
        return None
    low = value.lower()
    for keyword, et in _EVENT_TYPE_KEYWORDS:
        if keyword in low:
            return et.value
    return None


def guess_audience_level(value: str | None) -> str | None:
    if not value:
        return None
    low = value.lower()
    for keyword, al in _AUDIENCE_KEYWORDS:
        if keyword in low:
            return al.value
    return None


def _parse_int(value: str | None) -> int | None:
    if not value:
        return None
    m = re.search(r"-?\d[\d,]*", value)
    if not m:
        return None
    try:
        return int(m.group(0).replace(",", ""))
    except ValueError:
        return None


def parse_date(value: str | None, dayfirst: bool = False) -> date | None:
    """Parse a wide range of date spellings. Slash/dot/dash numeric dates are
    disambiguated by value (a part > 12 must be the day) and otherwise by the
    `dayfirst` hint (true for Symplectic's UK-style exports)."""
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    # Drop a trailing time ("2024-05-01 14:00" / "...T14:00:00").
    text = re.split(r"[T ]", text, maxsplit=1)[0] if re.match(r"^\d{4}-\d{2}-\d{2}[T ]", text) else text
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    # Numeric d/m/y or m/d/y with / . or - separators.
    m = re.match(r"^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})$", text)
    if m:
        a, b, c = (int(x) for x in m.groups())
        if a > 31:  # leading 4-digit year: YYYY-M-D
            year, month, day = a, b, c
        elif c > 31 or len(m.group(3)) == 4:  # trailing 4-digit year
            year = c
            if a > 12:  # a must be the day
                day, month = a, b
            elif b > 12:  # b must be the day
                month, day = a, b
            else:
                day, month = (a, b) if dayfirst else (b, a)
        else:  # all two-digit — assume 20xx year at the end
            year = 2000 + c if c < 100 else c
            if a > 12:
                day, month = a, b
            elif b > 12:
                month, day = a, b
            else:
                day, month = (a, b) if dayfirst else (b, a)
        try:
            return date(year, month, day)
        except ValueError:
            return None
    return None


def _parse_time(value: str | None) -> str | None:
    if not value:
        return None
    m = re.search(r"(\d{1,2}):(\d{2})", value)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h < 24 and 0 <= mi < 60:
            return f"{h:02d}:{mi:02d}"
    return None


def _build_draft(index: int, raw: dict[str, str], mapping: dict[str, str], dayfirst: bool) -> DraftEvent:
    def cell(field_name: str) -> str | None:
        col = mapping.get(field_name)
        if not col:
            return None
        val = raw.get(col)
        return val.strip() if val and val.strip() else None

    draft = DraftEvent(index=index, raw=raw)
    draft.title = cell("title")
    draft.date_raw = cell("date")
    parsed = parse_date(draft.date_raw, dayfirst=dayfirst)
    if parsed:
        draft.visit_date = parsed.isoformat()
    elif draft.date_raw:
        draft.warnings.append("date_unparsed")
    draft.event_type = guess_event_type(cell("event_type"))
    draft.audience_level = guess_audience_level(cell("audience_level"))
    draft.people_reached = _parse_int(cell("people_reached"))
    draft.venue_name = cell("venue_name")
    draft.venue_city = cell("venue_city")
    draft.description = cell("description")
    draft.start_time = _parse_time(cell("start_time"))
    draft.duration_minutes = _parse_int(cell("duration_minutes"))
    draft.language = cell("language")
    draft.presenters = cell("presenters")
    draft.url = cell("url")
    return draft


def parse_events_csv(content: bytes, mapping_override: dict[str, str] | None = None) -> ParsedCsv:
    text = _decode(content)
    columns, rows = _read_rows(text)
    fmt = detect_format(columns)
    suggested = suggest_mapping(columns)
    # Only honour override entries that point at real columns.
    mapping = dict(suggested)
    if mapping_override:
        for f, col in mapping_override.items():
            if f in MAPPABLE_FIELDS and (col in columns):
                mapping[f] = col
            elif f in MAPPABLE_FIELDS and col in (None, ""):
                mapping.pop(f, None)
    dayfirst = fmt == "symplectic"
    drafts = [_build_draft(i, raw, mapping, dayfirst) for i, raw in enumerate(rows)]
    return ParsedCsv(format=fmt, columns=columns, suggested_mapping=suggested, rows=drafts)
