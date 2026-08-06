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
    ("language", "Language"),
    ("people_reached", "People reached"),
    ("duration_minutes", "Duration (min)"),
    ("presenter", "Presenter"),
    ("additional_presenters", "Co-presenters"),
    ("host", "Host"),
    ("host_role", "Host role"),
    ("tags", "Tags"),
    ("coverage", "Coverage"),
    ("coverage_links", "Coverage links"),
    ("status", "Status"),
]

COVERAGE_LABELS = {
    "press": "Press",
    "social_media": "Social media",
    "video": "Video",
    "blog": "Blog",
    "website": "Website / agenda",
    "slides": "Slides / materials",
    "other": "Other",
}

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
    language: str | None
    people_reached: int
    duration_minutes: int | None
    status: Any
    venue_name: str
    venue_city: str | None
    venue_state: str | None
    venue_type: Any
    # Venue coordinates power the PDF activity map. Not private — the venue's
    # location is inherent to a public-facing activity record.
    latitude: float | None
    longitude: float | None
    # The host *relationship category* (e.g. "alumnus") drives an aggregate
    # breakdown only — not the host's contact details, which stay excluded.
    host_relationship: Any
    presenter: str
    additional_presenters: str | None
    host_name: str | None
    host_role: str | None
    tags: list[str]
    links: list[dict]
    # Remote/broadcast reach (#38) — defaulted so manually-built ReportVisits
    # (tests, ad hoc) don't need to pass it.
    is_broadcast: bool = False

    @classmethod
    def from_visit(cls, v: Any) -> "ReportVisit":
        return cls(
            visit_date=v.visit_date,
            title=v.title,
            event_type=v.event_type,
            audience_level=v.audience_level,
            language=v.language,
            people_reached=v.people_reached,
            is_broadcast=v.is_broadcast,
            duration_minutes=v.duration_minutes,
            status=v.status,
            venue_name=v.venue.name,
            venue_city=v.venue.city,
            venue_state=v.venue.state,
            venue_type=v.venue.venue_type,
            latitude=v.venue.latitude,
            longitude=v.venue.longitude,
            host_relationship=v.host_relationship,
            presenter=v.author.name,
            additional_presenters=v.additional_presenters,
            host_name=v.contact_name,
            host_role=v.host_role,
            tags=list(v.tags or []),
            links=list(v.links or []),
        )

    def coverage_categories(self) -> list[str]:
        """Distinct coverage categories present on this visit, in a stable order."""
        present = {(lk.get("category") or "other") for lk in self.links}
        return [c for c in COVERAGE_LABELS if c in present]

    def as_row(self) -> dict[str, Any]:
        location = ", ".join(p for p in (self.venue_city, self.venue_state) if p)
        return {
            "date": self.visit_date.isoformat(),
            "title": self.title,
            "event_type": _label(self.event_type),
            "event_type_raw": getattr(self.event_type, "value", self.event_type),
            "venue": self.venue_name,
            "city": self.venue_city or "",
            "state": self.venue_state or "",
            "location": location,
            "audience": _label(self.audience_level),
            "audience_raw": getattr(self.audience_level, "value", self.audience_level),
            "language": self.language or "",
            "people_reached": self.people_reached,
            "duration_minutes": self.duration_minutes,
            "presenter": self.presenter,
            "additional_presenters": self.additional_presenters or "",
            "host": self.host_name or "",
            "host_role": self.host_role or "",
            "tags": "; ".join(self.tags),
            "coverage": "; ".join(COVERAGE_LABELS[c] for c in self.coverage_categories()),
            "coverage_categories": self.coverage_categories(),
            "coverage_links": "; ".join(
                lk.get("url", "") for lk in self.links if lk.get("url")
            ),
            "status": _label(self.status),
            "status_raw": getattr(self.status, "value", self.status),
        }


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _breakdown(report_visits: list[ReportVisit], key_fn) -> list[dict[str, Any]]:
    """Aggregate visits + people reached by some category, most-active first."""
    agg: dict[Any, list[int]] = {}
    for rv in report_visits:
        key = key_fn(rv)
        if key is None:
            continue
        entry = agg.setdefault(key, [0, 0])
        entry[0] += 1
        entry[1] += rv.people_reached
    rows = [
        {"key": key, "label": _label(key), "visits": v, "people_reached": p}
        for key, (v, p) in agg.items()
    ]
    rows.sort(key=lambda r: (-r["visits"], -r["people_reached"], r["label"]))
    return rows


def build_analysis(report_visits: list[ReportVisit]) -> dict[str, Any]:
    """The same breakdowns the Analysis dashboard shows, computed over exactly
    the activities in this report so the figures always reconcile with the rows.
    Aggregate-only: no ratings, notes, or contact details."""
    # Activity by calendar year — a compact, grant-friendly time series.
    years: dict[int, list[int]] = {}
    for rv in report_visits:
        entry = years.setdefault(rv.visit_date.year, [0, 0])
        entry[0] += 1
        entry[1] += rv.people_reached
    timeline = [
        {"period": str(y), "visits": v, "people_reached": p}
        for y, (v, p) in sorted(years.items())
    ]

    venue_agg: dict[tuple[str, str | None], list[int]] = {}
    for rv in report_visits:
        entry = venue_agg.setdefault((rv.venue_name, rv.venue_city), [0, 0])
        entry[0] += 1
        entry[1] += rv.people_reached
    top_venues = sorted(
        (
            {"venue": name, "city": city or "", "visits": v, "people_reached": p}
            for (name, city), (v, p) in venue_agg.items()
        ),
        key=lambda r: (-r["visits"], -r["people_reached"], r["venue"]),
    )[:10]

    presenter_agg: dict[str, list[int]] = {}
    for rv in report_visits:
        entry = presenter_agg.setdefault(rv.presenter, [0, 0])
        entry[0] += 1
        entry[1] += rv.people_reached
    leaderboard = sorted(
        (
            {"name": name, "visits": v, "people_reached": p}
            for name, (v, p) in presenter_agg.items()
        ),
        key=lambda r: (-r["visits"], -r["people_reached"], r["name"]),
    )[:20]

    return {
        "by_venue_type": _breakdown(report_visits, lambda rv: _enum_value(rv.venue_type)),
        "by_event_type": _breakdown(report_visits, lambda rv: _enum_value(rv.event_type)),
        "by_audience_level": _breakdown(
            report_visits, lambda rv: _enum_value(rv.audience_level)
        ),
        "by_host_relationship": _breakdown(
            report_visits, lambda rv: _enum_value(rv.host_relationship)
        ),
        "timeline": timeline,
        "top_venues": top_venues,
        "leaderboard": leaderboard,
    }


def build_map_points(report_visits: list[ReportVisit]) -> list[dict[str, Any]]:
    """One entry per distinct geolocated venue, for the PDF activity map. Venues
    without coordinates (e.g. added by hand, never geocoded) are omitted."""
    agg: dict[tuple[str, str | None], dict[str, Any]] = {}
    for rv in report_visits:
        if rv.latitude is None or rv.longitude is None:
            continue
        key = (rv.venue_name, rv.venue_city)
        point = agg.get(key)
        if point is None:
            agg[key] = {
                "name": rv.venue_name,
                "city": rv.venue_city or "",
                "latitude": rv.latitude,
                "longitude": rv.longitude,
                "visits": 1,
                "people_reached": rv.people_reached,
            }
        else:
            point["visits"] += 1
            point["people_reached"] += rv.people_reached
    return list(agg.values())


def build_report(
    visits: Iterable[Any],
    *,
    scope: str,
    generated_at: datetime,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    """Assemble the report data structure (rows + summary + analysis + metadata)."""
    report_visits = [
        v if isinstance(v, ReportVisit) else ReportVisit.from_visit(v) for v in visits
    ]
    rows = [rv.as_row() for rv in report_visits]

    total_people = sum(rv.people_reached for rv in report_visits)
    total_people_remote = sum(rv.people_reached for rv in report_visits if rv.is_broadcast)
    venues = {rv.venue_name for rv in report_visits}
    presenters = {rv.presenter for rv in report_visits}
    dates = [rv.visit_date for rv in report_visits]

    # How many activities got each kind of coverage (press / social / …).
    coverage_counts = {c: 0 for c in COVERAGE_LABELS}
    activities_with_coverage = 0
    for rv in report_visits:
        cats = rv.coverage_categories()
        if cats:
            activities_with_coverage += 1
        for c in cats:
            coverage_counts[c] += 1

    return {
        "title": REPORT_TITLE,
        "scope": scope,
        "generated_at": generated_at.replace(microsecond=0).isoformat(),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "summary": {
            "total_activities": len(rows),
            "total_people_reached": total_people,
            "total_people_reached_remote": total_people_remote,
            "distinct_venues": len(venues),
            "active_communicators": len(presenters),
            "avg_people_per_activity": round(total_people / len(rows)) if rows else 0,
            "first_activity": min(dates).isoformat() if dates else None,
            "last_activity": max(dates).isoformat() if dates else None,
            "activities_with_coverage": activities_with_coverage,
            "coverage_counts": coverage_counts,
        },
        "analysis": build_analysis(report_visits),
        "map": {"points": build_map_points(report_visits)},
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


def _analysis_tables(report: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten the structured `analysis` block into simple titled tables that
    every text/PDF serializer renders the same way. Empty sections are dropped;
    the single-communicator leaderboard (scope=mine) is omitted as redundant."""
    a = report.get("analysis") or {}
    tables: list[dict[str, Any]] = []

    def add(title: str, headers: list[str], rows: list[list[Any]]) -> None:
        if rows:
            tables.append({"title": title, "headers": headers, "rows": rows})

    add(
        "Activity by year",
        ["Year", "Activities", "People reached"],
        [[t["period"], t["visits"], t["people_reached"]] for t in a.get("timeline", [])],
    )
    for key, title, label in (
        ("by_venue_type", "By venue type", "Venue type"),
        ("by_event_type", "By event type", "Event type"),
        ("by_audience_level", "By audience level", "Audience"),
        ("by_host_relationship", "By host relationship", "Host relationship"),
    ):
        add(
            title,
            [label, "Activities", "People reached"],
            [[r["label"], r["visits"], r["people_reached"]] for r in a.get(key, [])],
        )
    add(
        "Top venues",
        ["Venue", "City", "Activities", "People reached"],
        [[r["venue"], r["city"], r["visits"], r["people_reached"]] for r in a.get("top_venues", [])],
    )
    leaderboard = a.get("leaderboard", [])
    if len(leaderboard) > 1:
        add(
            "Communicators",
            ["Communicator", "Activities", "People reached"],
            [[r["name"], r["visits"], r["people_reached"]] for r in leaderboard],
        )
    return tables


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
    # Analysis summaries follow the row data as separate labeled blocks, so a
    # single CSV carries both the raw activities and the breakdowns.
    for table in _analysis_tables(report):
        writer.writerow([])
        writer.writerow([table["title"]])
        writer.writerow(table["headers"])
        for r in table["rows"]:
            writer.writerow(r)
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
        *(
            [f"  - *of which remote / broadcast:* {s['total_people_reached_remote']:,}"]
            if s.get("total_people_reached_remote")
            else []
        ),
        f"- **Distinct venues:** {s['distinct_venues']:,}",
    ]
    if s.get("active_communicators"):
        lines.append(f"- **Communicators:** {s['active_communicators']:,}")
    if s.get("total_activities"):
        lines.append(f"- **Avg. people per activity:** {s['avg_people_per_activity']:,}")
    cc = s.get("coverage_counts") or {}
    if s.get("activities_with_coverage"):
        parts = [f"{COVERAGE_LABELS[c]}: {n}" for c, n in cc.items() if n]
        lines.append(
            f"- **Activities with coverage:** {s['activities_with_coverage']:,} "
            f"({', '.join(parts)})"
        )

    for table in _analysis_tables(report):
        lines += ["", f"## {table['title']}", ""]
        lines.append("| " + " | ".join(table["headers"]) + " |")
        lines.append("| " + " | ".join("---" for _ in table["headers"]) + " |")
        for r in table["rows"]:
            cells = [str(c).replace("|", "\\|") for c in r]
            lines.append("| " + " | ".join(cells) + " |")

    lines += ["", "## Activities", ""]
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


def _latex_escape(text: Any) -> str:
    """Escape LaTeX's special characters so arbitrary venue/activity text is safe
    inside a table cell."""
    s = "" if text is None else str(text)
    repl = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(repl.get(ch, ch) for ch in s)


# Column widths (landscape A4) for the LaTeX longtable — mirrors the PDF's
# curated, publication-friendly column set.
_LATEX_COL_SPEC = {
    "date": r"p{1.7cm}",
    "title": r"p{4.5cm}",
    "event_type": r"p{2.4cm}",
    "venue": r"p{3.8cm}",
    "location": r"p{3cm}",
    "audience": r"p{2.4cm}",
    "people_reached": r"r",
    "presenter": r"p{3cm}",
}


def report_latex(report: dict[str, Any]) -> str:
    """A standalone, compilable LaTeX document with a booktabs longtable of the
    activities — for dropping into a grant report or paper (#14). Carries the
    same non-private columns as the PDF."""
    s = report["summary"]
    esc = _latex_escape
    lines = [
        r"\documentclass[10pt]{article}",
        r"\usepackage[landscape,margin=0.75in]{geometry}",
        r"\usepackage{longtable}",
        r"\usepackage{booktabs}",
        r"\usepackage[T1]{fontenc}",
        r"\usepackage[utf8]{inputenc}",
        r"\setlength{\LTleft}{0pt}",
        r"\setlength{\LTright}{0pt}",
        r"\begin{document}",
        r"\section*{" + esc(report["title"]) + "}",
        r"\noindent\textbf{Scope:} " + esc(_scope_label(report["scope"])) + r" \\",
        r"\textbf{Date range:} " + esc(_range_label(report)) + r" \\",
        r"\textbf{Generated:} " + esc(report["generated_at"]) + r" \\[4pt]",
        (
            r"\textbf{Activities:} " + f"{s['total_activities']:,}" + r" \quad "
            r"\textbf{People reached:} " + f"{s['total_people_reached']:,}" + r" \quad "
            + (
                r"\textbf{(remote:} " + f"{s['total_people_reached_remote']:,}" + r") \quad "
                if s.get("total_people_reached_remote")
                else ""
            )
            + r"\textbf{Distinct venues:} " + f"{s['distinct_venues']:,}"
        ),
        r"\bigskip",
    ]

    for table in _analysis_tables(report):
        colspec = "".join(
            "r" if h in ("Activities", "People reached") else "l" for h in table["headers"]
        )
        lines.append(r"\subsection*{" + esc(table["title"]) + "}")
        lines.append(r"\begin{tabular}{" + colspec + "}")
        lines.append(r"\toprule")
        lines.append(" & ".join(r"\textbf{" + esc(h) + "}" for h in table["headers"]) + r" \\")
        lines.append(r"\midrule")
        for r in table["rows"]:
            lines.append(" & ".join(esc(c) for c in r) + r" \\")
        lines += [r"\bottomrule", r"\end{tabular}", r"\medskip", ""]

    if not report["rows"]:
        lines.append(r"\emph{No activities match the selected filters.}")
        lines.append(r"\end{document}")
        return "\n".join(lines) + "\n"

    colspec = "".join(_LATEX_COL_SPEC[key] for key, _ in PDF_COLUMNS)
    header = " & ".join(r"\textbf{" + esc(h) + "}" for _, h in PDF_COLUMNS) + r" \\"
    lines += [
        r"\begin{longtable}{" + colspec + "}",
        r"\toprule",
        header,
        r"\midrule",
        r"\endfirsthead",
        r"\toprule",
        header,
        r"\midrule",
        r"\endhead",
    ]
    for row in report["rows"]:
        cells = " & ".join(esc(row.get(key, "")) for key, _ in PDF_COLUMNS)
        lines.append(cells + r" \\")
    lines += [r"\bottomrule", r"\end{longtable}", r"\end{document}"]
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


_BRAND_RGB = (109, 65, 236)
_NUMERIC_HEADERS = {"Activities", "People reached"}


def _pdf_table(pdf: Any, table: dict[str, Any], usable_w: float) -> None:
    """Render one analysis breakdown as a compact table matching the report's
    house style (purple header, zebra rows)."""
    headers = table["headers"]
    fixed = {"Activities": 26, "People reached": 34}
    text_cols = [h for h in headers if h not in _NUMERIC_HEADERS]
    text_w = (usable_w - sum(fixed[h] for h in headers if h in fixed)) / max(1, len(text_cols))
    widths = [fixed.get(h, text_w) for h in headers]

    if pdf.get_y() > 175:  # keep a title + a couple of rows together
        pdf.add_page()
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 7, _pdf_safe(table["title"]), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(*_BRAND_RGB)
    pdf.set_text_color(255, 255, 255)
    for h, w in zip(headers, widths):
        pdf.cell(w, 7, _pdf_safe(h), border=0, fill=True,
                 align="R" if h in _NUMERIC_HEADERS else "L")
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(20, 20, 20)
    fill = False
    for r in table["rows"]:
        pdf.set_fill_color(240, 238, 250) if fill else pdf.set_fill_color(255, 255, 255)
        for h, value, w in zip(headers, r, widths):
            numeric = h in _NUMERIC_HEADERS
            text = _pdf_safe(f"{value:,}" if numeric and isinstance(value, int) else value)
            max_chars = max(4, int(w / 1.6))
            if len(text) > max_chars:
                text = _pdf_safe(text[: max_chars - 1].rstrip() + "…")
            pdf.cell(w, 6, text, border="B", fill=True, align="R" if numeric else "L")
        pdf.ln()
        fill = not fill


# CARTO "light" raster basemap — the very tiles the web map uses (see
# frontend/src/pages/MapPage.tsx) — stitched into a static image behind the PDF
# activity map. Fetched at report time; if the backend can't reach the tile
# server we fall back to the dependency-free vector coverage map below.
_BASEMAP_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
_BASEMAP_SUBDOMAINS = ("a", "b", "c", "d")
_BASEMAP_TILE_PX = 512  # @2x retina tiles for print-quality output
_BASEMAP_MAX_TILES = 30
_BASEMAP_ATTRIBUTION = "(c) OpenStreetMap  (c) CARTO"


def _mercator_px(lat: float, lon: float, z: int, tile_px: int) -> tuple[float, float]:
    """Web-Mercator global pixel coordinate at zoom `z` (origin top-left), the
    projection the slippy-map tiles are drawn in."""
    import math

    n = tile_px * (2 ** z)
    lat = max(min(lat, 85.05112878), -85.05112878)
    lat_rad = math.radians(lat)
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n
    return x, y


def _pick_basemap_zoom(
    min_lat: float, max_lat: float, min_lon: float, max_lon: float,
    tile_px: int, target_w: float, target_h: float, max_tiles: int,
) -> int:
    """Largest zoom whose pixel bbox fits the target image and tile budget — so a
    citywide report gets street detail and a transatlantic one gets a world view."""
    import math

    for z in range(16, -1, -1):
        left = _mercator_px(0.0, min_lon, z, tile_px)[0]
        right = _mercator_px(0.0, max_lon, z, tile_px)[0]
        top = _mercator_px(max_lat, 0.0, z, tile_px)[1]
        bottom = _mercator_px(min_lat, 0.0, z, tile_px)[1]
        w, h = right - left, bottom - top
        if w <= 0 or h <= 0:
            continue
        tx_min, tx_max = math.floor(left / tile_px), math.floor((right - 1e-6) / tile_px)
        ty_min, ty_max = math.floor(top / tile_px), math.floor((bottom - 1e-6) / tile_px)
        tiles = (tx_max - tx_min + 1) * (ty_max - ty_min + 1)
        if w <= target_w and h <= target_h and tiles <= max_tiles:
            return z
    return 0


def _fetch_basemap(coords: list[dict[str, Any]]):
    """Stitch CARTO tiles covering the venue bbox into one image. Returns
    (PIL image, project(lat, lon)->(px, py), (width, height)) or raises if the
    tiles can't be fetched (offline / restricted backend)."""
    import io
    import math
    from concurrent.futures import ThreadPoolExecutor

    import httpx
    from PIL import Image

    lats = [c["latitude"] for c in coords]
    lons = [c["longitude"] for c in coords]
    min_lat, max_lat, min_lon, max_lon = min(lats), max(lats), min(lons), max(lons)
    # Pad so a single venue still gets surrounding context, and clamp to the
    # projectable world.
    lat_span = max(max_lat - min_lat, 0.02)
    lon_span = max(max_lon - min_lon, 0.02)
    min_lat = max(min_lat - lat_span * 0.12, -85.0)
    max_lat = min(max_lat + lat_span * 0.12, 85.0)
    min_lon = max(min_lon - lon_span * 0.12, -180.0)
    max_lon = min(max_lon + lon_span * 0.12, 180.0)

    tile_px = _BASEMAP_TILE_PX
    z = _pick_basemap_zoom(min_lat, max_lat, min_lon, max_lon, tile_px, 1600, 1000, _BASEMAP_MAX_TILES)
    n_tiles = 2 ** z
    left = _mercator_px(0.0, min_lon, z, tile_px)[0]
    right = _mercator_px(0.0, max_lon, z, tile_px)[0]
    top = _mercator_px(max_lat, 0.0, z, tile_px)[1]
    bottom = _mercator_px(min_lat, 0.0, z, tile_px)[1]
    tx_min, tx_max = math.floor(left / tile_px), math.floor((right - 1e-6) / tile_px)
    ty_min, ty_max = math.floor(top / tile_px), math.floor((bottom - 1e-6) / tile_px)

    retina = "@2x" if tile_px == 512 else ""
    headers = {"User-Agent": "DOCENT-report/1.0 (+https://github.com/lawrenceleejr/docent)"}
    timeout = httpx.Timeout(6.0, connect=3.0)

    def fetch(client: Any, tx: int, ty: int):
        if ty < 0 or ty >= n_tiles:  # above north / below south pole: blank
            return tx, ty, None
        x = tx % n_tiles  # wrap longitude
        s = _BASEMAP_SUBDOMAINS[(tx + ty) % len(_BASEMAP_SUBDOMAINS)]
        url = _BASEMAP_TILE_URL.format(s=s, z=z, x=x, y=ty, r=retina)
        resp = client.get(url)
        resp.raise_for_status()
        return tx, ty, Image.open(io.BytesIO(resp.content)).convert("RGB")

    canvas = Image.new(
        "RGB",
        ((tx_max - tx_min + 1) * tile_px, (ty_max - ty_min + 1) * tile_px),
        (245, 245, 247),
    )
    total = failures = 0
    with httpx.Client(timeout=timeout, headers=headers, follow_redirects=True) as client:
        with ThreadPoolExecutor(max_workers=6) as pool:
            jobs = [
                pool.submit(fetch, client, tx, ty)
                for ty in range(ty_min, ty_max + 1)
                for tx in range(tx_min, tx_max + 1)
            ]
            for job in jobs:
                total += 1
                try:
                    tx, ty, img = job.result()
                except Exception:
                    failures += 1
                    continue
                if img is not None:
                    canvas.paste(img, ((tx - tx_min) * tile_px, (ty - ty_min) * tile_px))
    if total == 0 or failures > total * 0.4:
        raise RuntimeError("basemap tiles unavailable")

    origin_x, origin_y = tx_min * tile_px, ty_min * tile_px
    crop = canvas.crop((
        round(left - origin_x), round(top - origin_y),
        round(right - origin_x), round(bottom - origin_y),
    ))

    def project(lat: float, lon: float) -> tuple[float, float]:
        px, py = _mercator_px(lat, lon, z, tile_px)
        return px - left, py - top

    return crop, project, crop.size


def _draw_map_dots(pdf: Any, coords: list[dict[str, Any]], project, panel: tuple[float, float, float, float], crop_size: tuple[int, int]) -> None:
    """Draw venue dots (sized by activity count) onto a placed map panel, using
    the panel's own projection so the dots land exactly on their coordinates."""
    import math

    panel_x, panel_y, panel_w, panel_h = panel
    crop_w, crop_h = crop_size
    sx, sy = panel_w / crop_w, panel_h / crop_h
    pdf.set_fill_color(*_BRAND_RGB)
    pdf.set_draw_color(255, 255, 255)
    pdf.set_line_width(0.3)
    for c in coords:
        fx, fy = project(c["latitude"], c["longitude"])
        px, py = panel_x + fx * sx, panel_y + fy * sy
        r = min(1.2 + 0.55 * math.sqrt(max(c["visits"] - 1, 0)), 3.4)
        pdf.ellipse(px - r, py - r, 2 * r, 2 * r, style="FD")


def _pdf_map(pdf: Any, points: list[dict[str, Any]], usable_w: float, basemap: bool = True) -> None:
    """Activity map for the PDF: a real CARTO basemap (matching the web map) with
    venue dots on top, or the offline vector coverage map when basemaps are
    disabled or the tiles can't be fetched."""
    coords = [p for p in points if p.get("latitude") is not None and p.get("longitude") is not None]

    pdf.ln(3)
    if not coords:
        _pdf_map_heading(pdf)
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 6, "No venues with coordinates to map.", new_x="LMARGIN", new_y="NEXT")
        return

    # Try to fetch a real basemap; on any failure fall through to the vector map.
    crop = project = None
    crop_w = crop_h = 0
    if basemap:
        try:
            crop, project, (crop_w, crop_h) = _fetch_basemap(coords)
        except Exception:
            crop = None

    # Decide the panel height BEFORE printing the heading so a tall map never
    # orphans its title on the previous page. Cap the height so the map still
    # shares page one with the summary.
    if crop is not None:
        max_h = 120.0
        panel_w = usable_w
        panel_h = panel_w * crop_h / crop_w
        if panel_h > max_h:
            panel_h = max_h
            panel_w = panel_h * crop_w / crop_h
    else:
        panel_h = 84.0
    if pdf.get_y() + 7 + panel_h + 8 > pdf.h - pdf.b_margin:
        pdf.add_page()
    _pdf_map_heading(pdf)

    if crop is None:
        _pdf_vector_map(pdf, coords, usable_w)  # offline / restricted fallback
        return

    import io

    panel_x = pdf.l_margin + (usable_w - panel_w) / 2
    panel_y = pdf.get_y()
    buf = io.BytesIO()
    crop.save(buf, format="PNG")
    buf.seek(0)
    pdf.image(buf, x=panel_x, y=panel_y, w=panel_w, h=panel_h)
    pdf.set_draw_color(200, 198, 210)
    pdf.set_line_width(0.3)
    pdf.rect(panel_x, panel_y, panel_w, panel_h)

    _draw_map_dots(pdf, coords, project, (panel_x, panel_y, panel_w, panel_h), (crop_w, crop_h))

    pdf.set_xy(pdf.l_margin, panel_y + panel_h + 1)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(120, 120, 120)
    caption = (
        f"{len(coords)} mapped venue{'s' if len(coords) != 1 else ''}  |  "
        f"dot size scales with activity count  |  {_BASEMAP_ATTRIBUTION}"
    )
    pdf.cell(0, 5, _pdf_safe(caption), new_x="LMARGIN", new_y="NEXT")


def _pdf_map_heading(pdf: Any) -> None:
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 7, "Activity map", new_x="LMARGIN", new_y="NEXT")


def _pdf_vector_map(pdf: Any, coords: list[dict[str, Any]], usable_w: float) -> None:
    """Dependency-free offline fallback: venue coordinates projected
    (equirectangular, aspect-corrected) into a framed panel as dots sized by
    activity count. No basemap tiles — used when tile fetching fails."""
    import math

    lats = [c["latitude"] for c in coords]
    lons = [c["longitude"] for c in coords]
    min_lat, max_lat, min_lon, max_lon = min(lats), max(lats), min(lons), max(lons)
    # Pad so a single venue (or a colinear set) still projects sensibly.
    lat_span = max(max_lat - min_lat, 0.02)
    lon_span = max(max_lon - min_lon, 0.02)
    min_lat -= lat_span * 0.08
    max_lat += lat_span * 0.08
    min_lon -= lon_span * 0.08
    max_lon += lon_span * 0.08
    cos_lat = max(math.cos(math.radians((min_lat + max_lat) / 2)), 0.1)
    data_w = (max_lon - min_lon) * cos_lat
    data_h = max_lat - min_lat

    # Size the panel to the data's aspect (bounded) so the frame hugs the points
    # instead of stranding a tight cluster in a wide, mostly-empty box. Placement
    # (page-break, heading) is handled by the caller so the height must match the
    # 84.0 the caller reserved.
    pad = 6.0
    panel_h = 84.0
    panel_w = min(max(panel_h * (data_w / data_h), 96.0), usable_w)
    panel_x = pdf.l_margin + (usable_w - panel_w) / 2
    panel_y = pdf.get_y()

    # Frame.
    pdf.set_draw_color(200, 198, 210)
    pdf.set_fill_color(249, 248, 253)
    pdf.set_line_width(0.3)
    pdf.rect(panel_x, panel_y, panel_w, panel_h, style="DF")

    inner_w, inner_h = panel_w - 2 * pad, panel_h - 2 * pad
    scale = min(inner_w / data_w, inner_h / data_h)
    draw_w, draw_h = data_w * scale, data_h * scale
    off_x = panel_x + pad + (inner_w - draw_w) / 2
    off_y = panel_y + pad + (inner_h - draw_h) / 2

    pdf.set_fill_color(*_BRAND_RGB)
    pdf.set_draw_color(255, 255, 255)
    pdf.set_line_width(0.2)
    for c in coords:
        fx = (c["longitude"] - min_lon) * cos_lat * scale
        fy = (c["latitude"] - min_lat) * scale
        px = off_x + fx
        py = off_y + (draw_h - fy)  # invert so north is up
        r = min(1.1 + 0.5 * math.sqrt(max(c["visits"] - 1, 0)), 3.2)
        pdf.ellipse(px - r, py - r, 2 * r, 2 * r, style="FD")

    pdf.set_xy(pdf.l_margin, panel_y + panel_h + 1)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(120, 120, 120)
    caption = (
        f"{len(coords)} mapped venue{'s' if len(coords) != 1 else ''}  |  "
        f"dot size scales with activity count"
    )
    pdf.cell(0, 5, _pdf_safe(caption), new_x="LMARGIN", new_y="NEXT")


def report_pdf(report: dict[str, Any], *, basemap: bool = True) -> bytes:
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
        + (
            f"(remote: {s['total_people_reached_remote']:,})    "
            if s.get("total_people_reached_remote")
            else ""
        )
        + f"Distinct venues: {s['distinct_venues']:,}"
    )
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 8, _pdf_safe(summary), new_x="LMARGIN", new_y="NEXT")
    if s.get("active_communicators"):
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(90, 90, 90)
        pdf.cell(
            0, 6,
            _pdf_safe(
                f"Communicators: {s['active_communicators']:,}    "
                f"Avg. people per activity: {s['avg_people_per_activity']:,}"
            ),
            new_x="LMARGIN", new_y="NEXT",
        )
    pdf.ln(2)

    usable_w = pdf.w - pdf.l_margin - pdf.r_margin

    # Map of the selected activities, then the same breakdowns as the dashboard.
    _pdf_map(pdf, report.get("map", {}).get("points", []), usable_w, basemap=basemap)
    for table in _analysis_tables(report):
        _pdf_table(pdf, table, usable_w)

    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 8, "Activities", new_x="LMARGIN", new_y="NEXT")

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
    ext = {"json": "json", "csv": "csv", "md": "md", "pdf": "pdf", "latex": "tex"}[fmt]
    return f"docent-report-{generated_at.strftime('%Y%m%d')}.{ext}"


CONTENT_TYPES = {
    "json": "application/json",
    "csv": "text/csv",
    "md": "text/markdown",
    "pdf": "application/pdf",
    "latex": "application/x-tex",
}
