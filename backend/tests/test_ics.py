from datetime import date, datetime, time, timezone

from app.models import VisitStatus
from app.services.ics import CalendarEvent, build_calendar

NOW = datetime(2026, 7, 10, 12, 0, 0, tzinfo=timezone.utc)


def _lines(cal: str) -> list[str]:
    return cal.split("\r\n")


def test_all_day_event():
    ev = CalendarEvent(
        id=5, title="Career day", venue_name="Fulton High",
        visit_date=date(2026, 9, 1), start_time=None, duration_minutes=None,
        status=VisitStatus.planned, location="Knoxville, TN", description=None,
    )
    cal = build_calendar([ev], NOW)
    assert cal.startswith("BEGIN:VCALENDAR\r\n")
    assert cal.strip().endswith("END:VCALENDAR")
    lines = _lines(cal)
    assert "UID:docent-visit-5@docent" in lines
    assert "DTSTART;VALUE=DATE:20260901" in lines
    assert "DTEND;VALUE=DATE:20260902" in lines  # exclusive next day
    assert "SUMMARY:Career day — Fulton High" in lines
    assert "LOCATION:Knoxville\\, TN" in lines  # comma escaped
    assert "STATUS:TENTATIVE" in lines  # planned


def test_timed_event_uses_duration_and_is_floating():
    ev = CalendarEvent(
        id=7, title="Lab tour", venue_name="Pellissippi State",
        visit_date=date(2026, 10, 5), start_time=time(10, 0), duration_minutes=90,
        status=VisitStatus.completed, location=None, description="Cleanroom",
    )
    lines = _lines(build_calendar([ev], NOW))
    assert "DTSTART:20261005T100000" in lines  # floating: no Z, no TZID
    assert "DTEND:20261005T113000" in lines  # +90 min
    assert "STATUS:CONFIRMED" in lines
    assert "DESCRIPTION:Cleanroom" in lines


def test_timed_event_defaults_60_min():
    ev = CalendarEvent(
        id=8, title="Demo", venue_name="Museum", visit_date=date(2026, 1, 2),
        start_time=time(14, 30), duration_minutes=None, status=VisitStatus.planned,
        location=None, description=None,
    )
    assert "DTEND:20260102T153000" in _lines(build_calendar([ev], NOW))


def test_escaping_and_dtstamp():
    ev = CalendarEvent(
        id=9, title="A; b, c\nd", venue_name="V", visit_date=date(2026, 3, 3),
        start_time=None, duration_minutes=None, status=VisitStatus.planned,
        location=None, description=None,
    )
    lines = _lines(build_calendar([ev], NOW))
    assert "SUMMARY:A\\; b\\, c\\nd — V" in lines
    assert "DTSTAMP:20260710T120000Z" in lines


def test_long_line_is_folded():
    ev = CalendarEvent(
        id=10, title="X" * 120, venue_name="Y", visit_date=date(2026, 4, 4),
        start_time=None, duration_minutes=None, status=VisitStatus.planned,
        location=None, description=None,
    )
    cal = build_calendar([ev], NOW)
    # Folded continuation lines begin with a single space.
    assert "\r\n " in cal
    assert all(len(line.encode()) <= 75 for line in cal.split("\r\n"))
