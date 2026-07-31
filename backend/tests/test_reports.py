import pytest

from tests.conftest import create_venue, create_visit, register


@pytest.fixture
def seeded(client, make_client):
    register(client, email="ada@example.com", name="Ada Lovelace")
    other = make_client()
    register(other, email="grace@example.com", name="Grace Hopper")

    school = create_venue(client)
    college = create_venue(client, name="Pellissippi State", venue_type="community_college")

    # A completed visit with private fields that must NOT leak into reports.
    create_visit(
        client, school["id"], visit_date="2026-01-10", people_reached=25,
        title="Rocket day", rating=4, reflection="went great, kids loved it",
        description="secret internal notes", contact_name="Ms. Rivera",
        contact_email="rivera@school.edu", host_notes="call her in fall",
    )
    create_visit(client, school["id"], visit_date="2026-02-20", people_reached=30,
                 title="Volcano demo")
    create_visit(other, college["id"], visit_date="2026-03-01", people_reached=45,
                 title="Careers talk", audience_level="community_college")
    # A planned (future) event — excluded from the default completed report.
    create_visit(client, school["id"], visit_date="2027-09-15", people_reached=0,
                 title="Planned open house", status="planned")
    return {"client": client, "other": other}


def _get(client, **params):
    return client.get("/api/reports/activities", params=params)


def test_scope_mine_vs_all(seeded, client):
    mine = _get(client, format="json", scope="mine").json()
    # Ada's two completed visits (planned excluded by default).
    assert mine["summary"]["total_activities"] == 2
    assert {r["title"] for r in mine["rows"]} == {"Rocket day", "Volcano demo"}

    everyone = _get(client, format="json", scope="all").json()
    assert everyone["summary"]["total_activities"] == 3
    assert everyone["summary"]["total_people_reached"] == 100
    assert everyone["summary"]["distinct_venues"] == 2


def test_status_filter(seeded, client):
    default = _get(client, format="json", scope="all").json()
    assert all(r["status"] == "Completed" for r in default["rows"])

    all_status = _get(client, format="json", scope="all", status="all").json()
    titles = {r["title"] for r in all_status["rows"]}
    assert "Planned open house" in titles
    assert all_status["summary"]["total_activities"] == 4


def test_date_range_and_filters(seeded, client):
    january = _get(
        client, format="json", scope="all", date_from="2026-01-01", date_to="2026-01-31"
    ).json()
    assert january["summary"]["total_activities"] == 1
    assert january["date_from"] == "2026-01-01"
    assert january["rows"][0]["title"] == "Rocket day"

    college = _get(client, format="json", scope="all", venue_type="community_college").json()
    assert college["summary"]["total_activities"] == 1
    assert college["rows"][0]["venue"] == "Pellissippi State"


def test_excludes_private_fields(seeded, client):
    """Reports must not leak notes, reflections, ratings, or host contact info."""
    payload = _get(client, format="json", scope="all").text.lower()
    for leaked in ["reflection", "rating", "secret internal notes", "rivera@school.edu",
                   "call her in fall", "went great"]:
        assert leaked not in payload, f"private data leaked: {leaked}"

    csv_text = _get(client, format="csv", scope="all").text.lower()
    assert "rating" not in csv_text
    assert "reflection" not in csv_text
    assert "rivera@school.edu" not in csv_text
    # But factual data is present.
    assert "rocket day" in csv_text
    assert "people reached" in csv_text


def test_csv_format(seeded, client):
    resp = _get(client, format="csv", scope="mine")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.headers["content-disposition"].endswith(".csv")
    lines = resp.text.strip().splitlines()
    # The activity block leads: header + Ada's 2 completed visits (newest first).
    assert lines[0].startswith("Date,Activity,Event type")
    assert lines[1].startswith("2026-02-20")
    assert lines[2].startswith("2026-01-10")
    # Analysis breakdowns are appended as labeled sections after the rows.
    assert "By venue type" in resp.text
    assert "Activity by year" in resp.text


def test_language_column_and_filter(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], title="Charla en español", language="Spanish")
    create_visit(client, venue["id"], title="English talk")

    all_rows = _get(client, format="json", scope="all").json()["rows"]
    by_title = {r["title"]: r["language"] for r in all_rows}
    assert by_title["Charla en español"] == "Spanish"
    assert by_title["English talk"] == ""

    filtered = _get(client, format="json", scope="all", language="Spanish").json()
    assert filtered["summary"]["total_activities"] == 1
    assert filtered["rows"][0]["title"] == "Charla en español"

    csv_text = _get(client, format="csv", scope="all").text
    assert "Language" in csv_text.splitlines()[0]


def test_markdown_format(seeded, client):
    resp = _get(client, format="md", scope="all")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    body = resp.text
    assert body.startswith("# DOCENT Outreach Report")
    assert "## Summary" in body
    assert "| Date | Activity |" in body
    assert "Rocket day" in body


def test_pdf_format(seeded, client):
    resp = _get(client, format="pdf", scope="all")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.content[:5] == b"%PDF-"
    assert len(resp.content) > 500


def test_report_includes_analysis(seeded, client):
    """Every report carries the same breakdowns as the Analysis dashboard,
    computed over exactly the report's rows so the figures reconcile."""
    j = _get(client, format="json", scope="all").json()
    a = j["analysis"]
    # Breakdown totals reconcile with the row count / people total.
    assert sum(r["visits"] for r in a["by_venue_type"]) == j["summary"]["total_activities"]
    assert sum(r["people_reached"] for r in a["by_venue_type"]) == j["summary"]["total_people_reached"]
    # Two venue types among the three completed community activities.
    labels = {r["label"] for r in a["by_venue_type"]}
    assert "Elementary School" in labels and "Community College" in labels
    # Timeline is by year; all seeded completed activities fall in 2026.
    assert a["timeline"] == [{"period": "2026", "visits": 3, "people_reached": 100}]
    # Leaderboard names both communicators (internal report — names allowed).
    assert {r["name"] for r in a["leaderboard"]} == {"Ada Lovelace", "Grace Hopper"}
    assert j["summary"]["active_communicators"] == 2

    md = _get(client, format="md", scope="all").text
    assert "## By venue type" in md and "## Activity by year" in md and "## Top venues" in md
    tex = _get(client, format="latex", scope="all").text
    assert r"\subsection*{By venue type}" in tex


def test_pdf_map_uses_venue_coordinates(client):
    """PDF map points come from geolocated venues; venues without coordinates
    are simply omitted, and the PDF still renders."""
    register(client)
    mapped = create_venue(client, name="Observatory", latitude=35.96, longitude=-83.92)
    unmapped = create_venue(client, name="Mystery Hall", venue_type="other")
    create_visit(client, mapped["id"], title="Star party", people_reached=40)
    create_visit(client, unmapped["id"], title="Hidden talk", people_reached=10)

    j = _get(client, format="json", scope="all").json()
    names = {p["name"] for p in j["map"]["points"]}
    assert names == {"Observatory"}  # unmapped venue excluded
    point = j["map"]["points"][0]
    assert point["latitude"] == 35.96 and point["longitude"] == -83.92

    pdf = _get(client, format="pdf", scope="all")
    assert pdf.content[:5] == b"%PDF-"
    assert len(pdf.content) > 500


def test_pdf_basemap_math():
    """Web-Mercator projection and zoom selection back the PDF basemap: a citywide
    bbox picks a high (street-level) zoom, a transatlantic one a low (world) zoom,
    and north is up (higher latitude -> smaller pixel y)."""
    from app.services.reports import _mercator_px, _pick_basemap_zoom

    tile_px = 512
    # North is up.
    _, y_north = _mercator_px(48.0, 0.0, 4, tile_px)
    _, y_south = _mercator_px(30.0, 0.0, 4, tile_px)
    assert y_north < y_south
    # East is right.
    x_west, _ = _mercator_px(0.0, -120.0, 4, tile_px)
    x_east, _ = _mercator_px(0.0, 10.0, 4, tile_px)
    assert x_west < x_east

    citywide = _pick_basemap_zoom(35.95, 35.97, -83.93, -83.91, tile_px, 1600, 1000, 30)
    transatlantic = _pick_basemap_zoom(30.0, 55.7, -122.3, 18.0, tile_px, 1600, 1000, 30)
    assert citywide > transatlantic
    assert transatlantic >= 0


def test_pdf_basemap_embeds_image(monkeypatch):
    """When basemaps are enabled and tiles are reachable, the PDF embeds the
    stitched basemap image (larger output) instead of the vector fallback."""
    from PIL import Image

    from app.services import reports as R

    # Stub the network fetch with a synthetic image + projection so the basemap
    # drawing path runs deterministically, without hitting the tile server.
    def fake_fetch(coords):
        # A gradient (not a flat fill) so the embedded PNG has real, incompressible
        # content — proving the raster path ran, not just a tiny solid block.
        img = Image.new("RGB", (400, 240))
        px = img.load()
        for y in range(img.height):
            for x in range(img.width):
                px[x, y] = ((x * 7) % 256, (y * 11) % 256, ((x + y) * 5) % 256)
        lats = [c["latitude"] for c in coords]
        lons = [c["longitude"] for c in coords]
        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)

        def project(lat, lon):
            fx = (lon - min_lon) / max(max_lon - min_lon, 1e-6) * img.width
            fy = (max_lat - lat) / max(max_lat - min_lat, 1e-6) * img.height
            return fx, fy

        return img, project, img.size

    monkeypatch.setattr(R, "_fetch_basemap", fake_fetch)

    report = R.build_report(
        [
            R.ReportVisit(
                visit_date=__import__("datetime").date(2026, 1, 1), title="Star party",
                event_type=None, audience_level=None, language=None, people_reached=40,
                duration_minutes=None, status=None, venue_name="Observatory",
                venue_city="Knoxville", venue_state="TN", venue_type=None,
                latitude=35.96, longitude=-83.92, host_relationship=None,
                presenter="Ada", additional_presenters=None, host_name=None,
                host_role=None, tags=[], links=[],
            )
        ],
        scope="all",
        generated_at=__import__("datetime").datetime(2026, 7, 31, 12, 0),
    )
    with_basemap = R.report_pdf(report, basemap=True)
    without_basemap = R.report_pdf(report, basemap=False)
    assert with_basemap[:5] == b"%PDF-"
    # The embedded raster makes the basemap PDF materially larger than the
    # vector-only fallback.
    assert len(with_basemap) > len(without_basemap) + 5000


def test_requires_auth(client):
    assert client.get("/api/reports/activities").status_code == 401


def test_report_latex_format(client):
    register(client)
    venue = create_venue(client, name="Ada & Co. {Museum}")  # LaTeX-special chars
    create_visit(client, venue["id"], title="50% off science")

    r = client.get("/api/reports/activities", params={"format": "latex", "scope": "mine"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-tex")
    assert "docent-report-" in r.headers["content-disposition"]
    assert r.headers["content-disposition"].endswith(".tex")
    body = r.text
    assert r"\begin{longtable}" in body
    assert r"\documentclass" in body
    # Special characters are escaped, not emitted raw.
    assert r"\&" in body and r"\%" in body and r"\{" in body
    # Privacy: subjective/private fields never appear in a report.
    assert "reflection" not in body.lower()
