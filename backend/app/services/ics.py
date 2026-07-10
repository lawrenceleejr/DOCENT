"""Build an RFC 5545 iCalendar (.ics) document from visits.

Dependency-free and pure so it can be unit-tested. Times are exported as
*floating* (no TZID, no trailing Z) so each calendar app shows them in the
viewer's local zone — matching DOCENT's timezone-free date handling.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from app.models import VisitStatus


@dataclass
class CalendarEvent:
    id: int
    title: str
    venue_name: str
    visit_date: date
    start_time: time | None
    duration_minutes: int | None
    status: VisitStatus
    location: str | None
    description: str | None


def _escape(value: str) -> str:
    # RFC 5545 §3.3.11: escape backslash, semicolon, comma, and newlines.
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _fold(line: str) -> str:
    # RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + space.
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    parts: list[bytes] = []
    while len(encoded) > 75:
        # Don't split a multi-byte char: back off to a safe boundary.
        cut = 75
        while cut > 0 and (encoded[cut] & 0xC0) == 0x80:
            cut -= 1
        parts.append(encoded[:cut])
        encoded = b" " + encoded[cut:]
    parts.append(encoded)
    return "\r\n".join(p.decode("utf-8") for p in parts)


def _prop(name: str, value: str) -> str:
    return _fold(f"{name}:{value}")


def build_calendar(events: list[CalendarEvent], now: datetime) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//DOCENT//Outreach Tracker//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    dtstamp = now.strftime("%Y%m%dT%H%M%SZ")
    for e in events:
        lines.append("BEGIN:VEVENT")
        lines.append(_prop("UID", f"docent-visit-{e.id}@docent"))
        lines.append(_prop("DTSTAMP", dtstamp))
        if e.start_time is None:
            # All-day event: DATE value, DTEND is the next day (exclusive).
            lines.append(_prop("DTSTART;VALUE=DATE", e.visit_date.strftime("%Y%m%d")))
            lines.append(
                _prop("DTEND;VALUE=DATE", (e.visit_date + timedelta(days=1)).strftime("%Y%m%d"))
            )
        else:
            start = datetime.combine(e.visit_date, e.start_time)
            end = start + timedelta(minutes=e.duration_minutes or 60)
            lines.append(_prop("DTSTART", start.strftime("%Y%m%dT%H%M%S")))
            lines.append(_prop("DTEND", end.strftime("%Y%m%dT%H%M%S")))
        summary = f"{e.title} — {e.venue_name}" if e.venue_name else e.title
        lines.append(_prop("SUMMARY", _escape(summary)))
        if e.location:
            lines.append(_prop("LOCATION", _escape(e.location)))
        if e.description:
            lines.append(_prop("DESCRIPTION", _escape(e.description)))
        lines.append(
            _prop("STATUS", "CONFIRMED" if e.status == VisitStatus.completed else "TENTATIVE")
        )
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
