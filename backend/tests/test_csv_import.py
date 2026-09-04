import io

from app.services.csv_import import (
    detect_format,
    guess_audience_level,
    guess_event_type,
    parse_date,
    parse_events_csv,
    suggest_mapping,
)
from tests.conftest import register

# --- date parsing: the part users care most about ---

def test_parse_date_iso_and_verbose():
    from datetime import date
    assert parse_date("2024-05-01") == date(2024, 5, 1)
    assert parse_date("2024/05/01") == date(2024, 5, 1)
    assert parse_date("1 May 2024") == date(2024, 5, 1)
    assert parse_date("May 1, 2024") == date(2024, 5, 1)
    assert parse_date("01-May-2024") == date(2024, 5, 1)
    assert parse_date("20240501") == date(2024, 5, 1)
    assert parse_date("2024-05-01 14:30") == date(2024, 5, 1)
    assert parse_date("2024-05-01T14:30:00") == date(2024, 5, 1)


def test_parse_date_ambiguous_numeric():
    from datetime import date
    # Unambiguous by value: 13 can't be a month.
    assert parse_date("13/05/2024") == date(2024, 5, 13)
    assert parse_date("05/13/2024") == date(2024, 5, 13)
    # Ambiguous: follows the dayfirst hint (Symplectic = UK = day first).
    assert parse_date("05/06/2024", dayfirst=False) == date(2024, 5, 6)
    assert parse_date("05/06/2024", dayfirst=True) == date(2024, 6, 5)
    # Two-digit year.
    assert parse_date("5/6/24", dayfirst=False) == date(2024, 5, 6)
    # Garbage -> None, not an exception.
    assert parse_date("not a date") is None
    assert parse_date("") is None
    assert parse_date("99/99/2024") is None


# --- header mapping and format detection ---

def test_suggest_mapping_common_headers():
    mapping = suggest_mapping(["Event Title", "Date", "Location", "Attendance", "Notes"])
    assert mapping["title"] == "Event Title"
    assert mapping["date"] == "Date"
    assert mapping["venue_name"] == "Location"
    assert mapping["people_reached"] == "Attendance"
    assert mapping["description"] == "Notes"


def test_detect_symplectic():
    assert detect_format(["Title", "Reporting Date", "Data Source", "Favourite"]) == "symplectic"
    assert detect_format(["Title", "Date", "Where"]) == "generic"


def test_guess_enums():
    assert guess_event_type("Public engagement talk") == "public_lecture"
    assert guess_event_type("Science Fair judging") == "science_fair"
    assert guess_event_type("Workshop for teachers") == "workshop"
    assert guess_event_type("mystery") is None
    assert guess_audience_level("High school students") == "high_school"
    assert guess_audience_level("General public") == "general_public"
    assert guess_audience_level("???") is None


# --- whole-file parsing ---

GENERIC = (
    "Event Title,Date,Location,City,Attendance,Type,Audience\n"
    'Star party,2024-10-05,Ijams Nature Center,Knoxville,120,Public talk,General public\n'
    '"Physics demos, with liquid nitrogen",13/10/2024,West Hills Elementary,Knoxville,60,Classroom visit,Elementary\n'
    "Broken date row,sometime last spring,Somewhere,,15,,\n"
)


def test_parse_generic_csv():
    parsed = parse_events_csv(GENERIC.encode())
    assert parsed.format == "generic"
    assert len(parsed.rows) == 3

    star = parsed.rows[0]
    assert star.title == "Star party"
    assert star.visit_date == "2024-10-05"
    assert star.venue_name == "Ijams Nature Center"
    assert star.venue_city == "Knoxville"
    assert star.people_reached == 120
    assert star.event_type == "public_lecture"
    assert star.audience_level == "general_public"

    demos = parsed.rows[1]
    assert demos.title == "Physics demos, with liquid nitrogen"  # quoted comma survives
    assert demos.visit_date == "2024-10-13"  # 13 can only be a day
    assert demos.event_type == "classroom_visit"

    broken = parsed.rows[2]
    assert broken.visit_date is None
    assert broken.date_raw == "sometime last spring"
    assert "date_unparsed" in broken.warnings


SYMPLECTIC = (
    "Title,Reporting Date,Type,Data Source,Number of attendees,Organisation,Description\n"
    "Pint of Science,05/06/2024,Public engagement talk,manual,80,Crafty Bastard Brewery,Fun evening\n"
)


def test_parse_symplectic_dayfirst():
    parsed = parse_events_csv(SYMPLECTIC.encode())
    assert parsed.format == "symplectic"
    row = parsed.rows[0]
    # UK export: 05/06/2024 is 5 June, not May 6.
    assert row.visit_date == "2024-06-05"
    assert row.title == "Pint of Science"
    assert row.people_reached == 80
    assert row.venue_name == "Crafty Bastard Brewery"
    assert row.event_type == "public_lecture"
    assert row.description == "Fun evening"


def test_parse_semicolon_delimited_and_bom():
    csv_text = "﻿Title;Date;Place\nOpen house;2023-01-15;Nielsen Physics Building\n"
    parsed = parse_events_csv(csv_text.encode())
    assert parsed.rows[0].title == "Open house"
    assert parsed.rows[0].visit_date == "2023-01-15"
    assert parsed.rows[0].venue_name == "Nielsen Physics Building"


def test_mapping_override_wins():
    csv_text = "A,B,C\nMy talk,2024-02-02,Knoxville\n"
    parsed = parse_events_csv(
        csv_text.encode(), {"title": "A", "date": "B", "venue_city": "C"}
    )
    row = parsed.rows[0]
    assert row.title == "My talk"
    assert row.visit_date == "2024-02-02"
    assert row.venue_city == "Knoxville"


# --- the endpoint ---

def _upload(client, text: str, mapping: str | None = None, name="events.csv"):
    data = {"mapping": mapping} if mapping else {}
    return client.post(
        "/api/imports/events/parse",
        files={"file": (name, io.BytesIO(text.encode()), "text/csv")},
        data=data,
    )


def test_parse_endpoint(client):
    register(client)
    r = _upload(client, GENERIC)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["format"] == "generic"
    assert body["suggested_mapping"]["title"] == "Event Title"
    assert "title" in body["mappable_fields"]
    assert len(body["rows"]) == 3
    assert body["rows"][0]["visit_date"] == "2024-10-05"
    # The raw row rides along for the "unmapped columns" display.
    assert body["rows"][0]["raw"]["Event Title"] == "Star party"


def test_parse_endpoint_requires_auth(client):
    r = _upload(client, GENERIC)
    assert r.status_code == 401


def test_parse_endpoint_rejects_empty(client):
    register(client)
    r = _upload(client, "   ")
    assert r.status_code == 400


def test_parse_endpoint_mapping_override(client):
    register(client)
    r = _upload(client, "X,Y\nTalk,2024-03-03\n", mapping='{"title": "X", "date": "Y"}')
    assert r.status_code == 200
    assert r.json()["rows"][0]["title"] == "Talk"
    assert r.json()["rows"][0]["visit_date"] == "2024-03-03"
