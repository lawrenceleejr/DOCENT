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
    assert lines[0].startswith("Date,Activity,Event type")
    assert len(lines) == 3  # header + 2 rows


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


def test_requires_auth(client):
    assert client.get("/api/reports/activities").status_code == 401
