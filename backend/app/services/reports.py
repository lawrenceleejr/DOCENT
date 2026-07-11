"""Build downloadable outreach reports (JSON / CSV / Markdown / PDF).

These reports are meant for external audiences — grant reports, annual reviews,
"look what our community accomplished" summaries. They deliberately EXCLUDE
private/subjective fields (descriptions, reflections, ratings, host contact
details and notes) and carry only factual, brag-worthy activity data.

Everything here is pure and unit-testable: the router gathers the visits and
the timestamp, these functions turn them into bytes/strings per format.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Iterable

# Column key -> human header. This is the full, machine-readable column set used
# by JSON / CSV / Markdown. (PDF uses a narrower subset so it fits the page.)
REPORT_COLUMNS: list[tuple[str, str]] = [
    ("date", "Date"),
    ("title", "Activity"),
    ("event_type", "Event type"),
    ("venue", "Venue"),
    ("city", "City"),
    ("state", "State"),
    ("audience", "Audience"),
    ("people_reached", "People reached"),
    ("duration_minutes", "Duration (min)"),
    ("presenter", "Presenter"),
    ("additional_presenters", "Co-presenters"),
    ("host", "Host"),
    ("host_role", "Host role"),
    ("status", "Status"),
]

# Narrower set for the PDF's fixed-width landscape table.
PDF_COLUMNS: list[tuple[str, str]] = [
    ("date", "Date"),
    ("title", "Activity"),
    ("event_type", "Event type"),
    ("venue", "Venue"),
    ("location", "Location"),
    ("audience", "Audience"),
    ("people_reached", "People"),
    ("presenter", "Presenter"),
]

REPORT_TITLE = "DOCENT Outreach Report"


def _label(value: Any) -> str:
    """snake_case enum/string -> 'Title Case' for human-facing output."""
    if value is None:
        return ""
    raw = getattr(value, "value", value)
    return str(raw).replace("_", " ").title()


@dataclass
class ReportVisit:
    """The minimal, non-private slice of a Visit a report needs."""

    visit_date: date
    title: str
    event_type: Any
    audience_level: Any
    people_reached: int
    duration_minutes: int | None
    status: Any
    venue_name: str
    venue_city: str | None
    venue_state: str | None
    presenter: str
    additional_presenters: str | None
    host_name: str | None
    host_role: str | None

    @classmethod
    def from_visit(cls, v: Any) -> "ReportVisit":
        return cls(
            visit_date=v.visit_date,
            title=v.title,
            event_type=v.event_type,
            audience_level=v.audience_level,
            people_reached=v.people_reached,
            duration_minutes=v.duration_minutes,
            status=v.status,
            venue_name=v.venue.name,
            venue_city=v.venue.city,
            venue_state=v.venue.state,
            presenter=v.author.name,
            additional_presenters=v.additional_presenters,
            host_name=v.contact_name,
            host_role=v.host_role,
        )

    def as_row(self) -> dict[str, Any]:
        location = ", ".join(p for p in (self.venue_city, self.venue_state) if p)
        return {
            "date": self.visit_date.isoformat(),
            "title": self.title,
            "event_type": _label(self.event_type),
            "venue": self.venue_name,
            "city": self.venue_city or "",
            "state": self.venue_state or "",
            "location": location,
            "audience": _label(self.audience_level),
            "people_reached": self.people_reached,
            "duration_minutes": self.duration_minutes,
            "presenter": self.presenter,
            "additional_presenters": self.additional_presenters or "",
            "host": self.host_name or "",
            "host_role": self.host_role or "",
            "status": _label(self.status),
        }


def build_report(
    visits: Iterable[Any],
    *,
    scope: str,
    generated_at: datetime,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    """Assemble the report data structure (rows + summary + metadata)."""
    report_visits = [
        v if isinstance(v, ReportVisit) else ReportVisit.from_visit(v) for v in visits
    ]
    rows = [rv.as_row() for rv in report_visits]

    total_people = sum(rv.people_reached for rv in report_visits)
    venues = {rv.venue_name for rv in report_visits}
    dates = [rv.visit_date for rv in report_visits]

    return {
        "title": REPORT_TITLE,
        "scope": scope,
        "generated_at": generated_at.replace(microsecond=0).isoformat(),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "summary": {
            "total_activities": len(rows),
            "total_people_reached": total_people,
            "distinct_venues": len(venues),
            "first_activity": min(dates).isoformat() if dates else None,
            "last_activity": max(dates).isoformat() if dates else None,
        },
        "rows": rows,
    }


def _scope_label(scope: str) -> str:
    return "My activities" if scope == "mine" else "All community activities"


def _range_label(report: dict[str, Any]) -> str:
    lo = report["date_from"] or report["summary"]["first_activity"]
    hi = report["date_to"] or report["summary"]["last_activity"]
    if lo and hi:
        return f"{lo} to {hi}"
    return "All dates"


# --------------------------------------------------------------------------- #
# Serializers
# --------------------------------------------------------------------------- #

def report_json(report: dict[str, Any]) -> bytes:
    return json.dumps(report, indent=2).encode("utf-8")


def report_csv(report: dict[str, Any]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([header for _, header in REPORT_COLUMNS])
    for row in report["rows"]:
        writer.writerow([row.get(key, "") for key, _ in REPORT_COLUMNS])
    return buffer.getvalue()


def report_markdown(report: dict[str, Any]) -> str:
    s = report["summary"]
    lines = [
        f"# {report['title']}",
        "",
        f"- **Scope:** {_scope_label(report['scope'])}",
        f"- **Date range:** {_range_label(report)}",
        f"- **Generated:** {report['generated_at']}",
        "",
        "## Summary",
        "",
        f"- **Activities:** {s['total_activities']:,}",
        f"- **People reached:** {s['total_people_reached']:,}",
        f"- **Distinct venues:** {s['distinct_venues']:,}",
        "",
        "## Activities",
        "",
    ]
    if not report["rows"]:
        lines.append("_No activities match the selected filters._")
        return "\n".join(lines) + "\n"

    headers = [header for _, header in REPORT_COLUMNS]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("| " + " | ".join("---" for _ in headers) + " |")
    for row in report["rows"]:
        cells = []
        for key, _ in REPORT_COLUMNS:
            value = row.get(key, "")
            if value is None:
                value = ""
            # Escape pipes so the Markdown table stays intact.
            cells.append(str(value).replace("|", "\\|"))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def _pdf_safe(text: Any) -> str:
    """fpdf2 core fonts are latin-1; transliterate/replace anything outside it."""
    s = "" if text is None else str(text)
    replacements = {
        "—": "-", "–": "-", "‘": "'", "’": "'",
        "“": '"', "”": '"', "…": "...", "•": "-",
    }
    for bad, good in replacements.items():
        s = s.replace(bad, good)
    return s.encode("latin-1", "replace").decode("latin-1")


def report_pdf(report: dict[str, Any]) -> bytes:
    from fpdf import FPDF

    s = report["summary"]
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.set_margins(12, 12, 12)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, _pdf_safe(report["title"]), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(90, 90, 90)
    meta = (
        f"{_scope_label(report['scope'])}   |   {_range_label(report)}"
        f"   |   Generated {report['generated_at']}"
    )
    pdf.cell(0, 6, _pdf_safe(meta), new_x="LMARGIN", new_y="NEXT")
    summary = (
        f"Activities: {s['total_activities']:,}    "
        f"People reached: {s['total_people_reached']:,}    "
        f"Distinct venues: {s['distinct_venues']:,}"
    )
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 8, _pdf_safe(summary), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # Relative column widths for the landscape table.
    widths = {
        "date": 20, "title": 58, "event_type": 30, "venue": 52,
        "location": 40, "audience": 30, "people_reached": 18, "presenter": 35,
    }
    headers = [h for _, h in PDF_COLUMNS]
    col_widths = [widths[k] for k, _ in PDF_COLUMNS]

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(109, 65, 236)
    pdf.set_text_color(255, 255, 255)
    for header, w in zip(headers, col_widths):
        pdf.cell(w, 8, _pdf_safe(header), border=0, fill=True, align="L")
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(20, 20, 20)
    fill = False
    for row in report["rows"]:
        if fill:
            pdf.set_fill_color(240, 238, 250)
        else:
            pdf.set_fill_color(255, 255, 255)
        for (key, _), w in zip(PDF_COLUMNS, col_widths):
            value = row.get(key, "")
            text = _pdf_safe(value)
            # Truncate to keep single-line rows tidy within the fixed width.
            max_chars = max(4, int(w / 1.6))
            if len(text) > max_chars:
                text = text[: max_chars - 1].rstrip() + "…"
                text = _pdf_safe(text)
            align = "R" if key == "people_reached" else "L"
            pdf.cell(w, 6, text, border="B", fill=True, align=align)
        pdf.ln()
        fill = not fill

    if not report["rows"]:
        pdf.set_font("Helvetica", "I", 10)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 10, "No activities match the selected filters.", new_x="LMARGIN", new_y="NEXT")

    out = pdf.output()
    return bytes(out)


def report_filename(fmt: str, generated_at: datetime) -> str:
    ext = {"json": "json", "csv": "csv", "md": "md", "pdf": "pdf"}[fmt]
    return f"docent-report-{generated_at.strftime('%Y%m%d')}.{ext}"


CONTENT_TYPES = {
    "json": "application/json",
    "csv": "text/csv",
    "md": "text/markdown",
    "pdf": "application/pdf",
}
