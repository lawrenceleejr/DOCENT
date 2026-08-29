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


def _pdf_streams_text(data: bytes) -> str:
    """Inflate the PDF's FlateDecode content streams so text drawn on the page
    (Tj operators carry latin-1 strings) can be asserted on."""
    import re
    import zlib

    chunks = []
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        try:
            chunks.append(zlib.decompress(m.group(1)).decode("latin-1", "ignore"))
        except zlib.error:
            pass  # not a Flate stream (e.g. an embedded image)
    return "".join(chunks)


def test_scope_mine_uses_communicator_name(seeded, client):
    """A personal report says "<Name>'s activities", never "My activities" —
    the file gets shared, and "my" is ambiguous outside the app."""
    j = _get(client, format="json", scope="mine").json()
    assert j["scope_user"] == "Ada Lovelace"

    md = _get(client, format="md", scope="mine").text
    assert "Ada Lovelace's activities" in md
    assert "My activities" not in md

    tex = _get(client, format="latex", scope="mine").text
    assert "Ada Lovelace's activities" in tex

    pdf_text = _pdf_streams_text(_get(client, format="pdf", scope="mine").content)
    assert "Ada Lovelace's activities" in pdf_text

    # Community-wide reports are unchanged (and carry no scope_user).
    everyone = _get(client, format="json", scope="all").json()
    assert everyone["scope_user"] is None
    assert "All community activities" in _get(client, format="md", scope="all").text


def test_pdf_made_with_docent_footer(seeded, client, monkeypatch):
    """Every PDF page footer credits DOCENT with the same version the web
    footer shows (git tag / short hash / APP_VERSION)."""
    import app.routers.reports as reports_router

    monkeypatch.setattr(reports_router, "app_version", lambda: "v9.9.9-test")
    resp = _get(client, format="pdf", scope="all")
    text = _pdf_streams_text(resp.content)
    assert "Made with DOCENT v9.9.9-test" in text
    assert _get(client, format="json", scope="all").json()["app_version"] == "v9.9.9-test"


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

    tile_px = 256
    # North is up.
    _, y_north = _mercator_px(48.0, 0.0, 4, tile_px)
    _, y_south = _mercator_px(30.0, 0.0, 4, tile_px)
    assert y_north < y_south
    # East is right.
    x_west, _ = _mercator_px(0.0, -120.0, 4, tile_px)
    x_east, _ = _mercator_px(0.0, 10.0, 4, tile_px)
    assert x_west < x_east

    citywide = _pick_basemap_zoom(35.95, 35.97, -83.93, -83.91, tile_px, 800, 500, 30)
    transatlantic = _pick_basemap_zoom(30.0, 55.7, -122.3, 18.0, tile_px, 800, 500, 30)
    assert citywide > transatlantic
    assert transatlantic >= 0


def test_pdf_basemap_embeds_image(monkeypatch):
    """When basemaps are enabled and tiles are reachable, the PDF embeds the
    stitched basemap image (larger output) instead of the vector fallback."""
    from PIL import Image

    from app.services import reports as R

    # Stub the network fetch with a synthetic image + projection so the basemap
    # drawing path runs deterministically, without hitting the tile server.
    def fake_fetch(coords, bm):
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
    from app.services.basemap import DEFAULT_ATTRIBUTION, DEFAULT_LIGHT_URL, Basemap

    bm = Basemap(DEFAULT_LIGHT_URL, "", DEFAULT_ATTRIBUTION, monochrome=True)
    with_basemap = R.report_pdf(report, basemap=bm)
    without_basemap = R.report_pdf(report, basemap=None)
    assert with_basemap[:5] == b"%PDF-"
    # The embedded raster makes the basemap PDF materially larger than the
    # vector-only fallback.
    assert len(with_basemap) > len(without_basemap) + 5000


def _stub_tile_server(monkeypatch, tile_px):
    """Serve synthetic tiles of a given pixel size, recording requested URLs."""
    import io

    import httpx
    from PIL import Image

    requested = []

    class FakeResponse:
        def __init__(self, content):
            self.content = content

        def raise_for_status(self):
            return None

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url):
            requested.append(url)
            buf = io.BytesIO()
            # A gradient, so the monochrome transform has something to act on.
            img = Image.new("RGB", (tile_px, tile_px))
            px = img.load()
            for y in range(tile_px):
                for x in range(tile_px):
                    px[x, y] = (x % 256, y % 256, 120)
            img.save(buf, format="PNG")
            return FakeResponse(buf.getvalue())

    monkeypatch.setattr(httpx, "Client", FakeClient)
    return requested


def test_basemap_projection_independent_of_tile_pixel_size(monkeypatch):
    """The stitcher must not assume a tile's pixel size.

    Tile *indices* live on the slippy-map's nominal 256 px grid while the bytes
    a provider returns may be 256 or 512 (@2x). Conflating the two silently
    misplaces every venue dot — the old code hardcoded 512 — so assert a venue
    lands at the same *fractional* spot either way, with @2x only sharpening it.
    """
    from app.services import reports as R
    from app.services.basemap import DEFAULT_ATTRIBUTION, Basemap

    coords = [
        {"latitude": 35.96, "longitude": -83.92, "visits": 3},
        {"latitude": 36.01, "longitude": -84.27, "visits": 1},
    ]
    bm = Basemap("https://tiles.test/{z}/{x}/{y}.png", "", DEFAULT_ATTRIBUTION, True)

    results = {}
    for tile_px in (256, 512):
        _stub_tile_server(monkeypatch, tile_px)
        crop, project, (w, h) = R._fetch_basemap(coords, bm)
        fx, fy = project(35.96, -83.92)
        assert 0 <= fx <= w and 0 <= fy <= h, f"dot outside crop at {tile_px}px"
        results[tile_px] = (fx / w, fy / h, w, h)

    (lo_fx, lo_fy, lo_w, lo_h) = results[256]
    (hi_fx, hi_fy, hi_w, hi_h) = results[512]
    # Same place on the map...
    assert hi_fx == pytest.approx(lo_fx, abs=0.005)
    assert hi_fy == pytest.approx(lo_fy, abs=0.005)
    # ...at twice the resolution.
    assert hi_w == pytest.approx(lo_w * 2, rel=0.02)
    assert hi_h == pytest.approx(lo_h * 2, rel=0.02)


def test_basemap_resolution_does_not_depend_on_provider(monkeypatch):
    """A provider without @2x must not yield a half-resolution printed map.

    CARTO served 512px @2x tiles; OpenStreetMap serves 256px only. Rendering the
    same bbox from each has to land on roughly the same *pixel* size — the
    non-retina source going a zoom level deeper to get there — or switching the
    default silently halves the resolution of every PDF report's map.
    """
    from app.services import reports as R
    from app.services.basemap import DEFAULT_ATTRIBUTION, Basemap

    coords = [
        {"latitude": 35.96, "longitude": -83.92, "visits": 2},
        {"latitude": 36.01, "longitude": -84.27, "visits": 1},
    ]

    _stub_tile_server(monkeypatch, 512)
    retina, _, retina_size = R._fetch_basemap(
        coords, Basemap("https://t.test/{z}/{x}/{y}{r}.png", "", DEFAULT_ATTRIBUTION, True)
    )
    _stub_tile_server(monkeypatch, 256)
    plain, _, plain_size = R._fetch_basemap(
        coords, Basemap("https://t.test/{z}/{x}/{y}.png", "", DEFAULT_ATTRIBUTION, True)
    )

    # Within one zoom step's worth of rounding, the two are the same resolution.
    assert plain_size[0] == pytest.approx(retina_size[0], rel=0.25)
    assert plain_size[1] == pytest.approx(retina_size[1], rel=0.25)
    # And both are genuinely high-resolution, not a 640px thumbnail.
    assert plain_size[0] > 900 and retina_size[0] > 900


def test_basemap_retina_only_requested_when_offered(monkeypatch):
    """`{r}` is a CARTO-ism. Appending @2x to a provider that doesn't offer it
    (OSM) yields 404s and a blank map, so only substitute it when asked for."""
    from app.services import reports as R
    from app.services.basemap import DEFAULT_ATTRIBUTION, Basemap

    coords = [{"latitude": 35.96, "longitude": -83.92, "visits": 1}]

    plain = _stub_tile_server(monkeypatch, 256)
    R._fetch_basemap(coords, Basemap("https://tiles.test/{z}/{x}/{y}.png", "", DEFAULT_ATTRIBUTION, True))
    assert plain and not any("@2x" in u for u in plain)

    retina = _stub_tile_server(monkeypatch, 512)
    R._fetch_basemap(
        coords,
        Basemap("https://tiles.test/{z}/{x}/{y}{r}.png", "", DEFAULT_ATTRIBUTION, True),
    )
    assert retina and all("@2x" in u for u in retina)


def test_basemap_monochrome_removes_colour(monkeypatch):
    """The PDF map must get the same flat treatment as the web map, so the
    report and the screen agree."""
    from app.services import reports as R
    from app.services.basemap import DEFAULT_ATTRIBUTION, Basemap

    coords = [{"latitude": 35.96, "longitude": -83.92, "visits": 1}]
    url = "https://tiles.test/{z}/{x}/{y}.png"

    _stub_tile_server(monkeypatch, 256)
    mono, _, _ = R._fetch_basemap(coords, Basemap(url, "", DEFAULT_ATTRIBUTION, True))
    _stub_tile_server(monkeypatch, 256)
    colour, _, _ = R._fetch_basemap(coords, Basemap(url, "", DEFAULT_ATTRIBUTION, False))

    # The stub paints a coloured gradient; monochrome must flatten every pixel.
    def triples(img):
        raw = img.convert("RGB").tobytes()
        return [tuple(raw[i : i + 3]) for i in range(0, len(raw), 3)]

    assert all(r == g == b for r, g, b in triples(mono))
    assert any(r != g or g != b for r, g, b in triples(colour))


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
