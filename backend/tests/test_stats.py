import pytest

from tests.conftest import create_venue, create_visit, register


@pytest.fixture
def seeded(client, make_client):
    register(client, email="ada@example.com", name="Ada")
    other = make_client()
    register(other, email="grace@example.com", name="Grace")

    school = create_venue(client)
    college = create_venue(client, name="Pellissippi State", venue_type="community_college")

    create_visit(client, school["id"], visit_date="2026-01-10", people_reached=25, rating=4)
    create_visit(client, school["id"], visit_date="2026-01-20", people_reached=30, rating=5)
    create_visit(client, college["id"], visit_date="2026-02-15", people_reached=100,
                 audience_level="community_college", event_type="public_lecture")
    create_visit(other, college["id"], visit_date="2026-03-01", people_reached=45,
                 audience_level="community_college", rating=3)
    return {"client": client, "other": other}


def test_summary(seeded, client):
    summary = client.get("/api/stats/summary").json()
    assert summary["total_visits"] == 4
    assert summary["total_people_reached"] == 200
    assert summary["distinct_venues"] == 2
    assert summary["active_communicators"] == 2
    assert summary["avg_rating"] == 4.0

    january = client.get(
        "/api/stats/summary", params={"date_from": "2026-01-01", "date_to": "2026-01-31"}
    ).json()
    assert january["total_visits"] == 2
    assert january["total_people_reached"] == 55


def test_timeseries_monthly_for_short_span(seeded, client):
    # ~2 months of data → monthly buckets, not one coarse half-year bar (#27).
    by = {p["period"]: p for p in client.get("/api/stats/timeseries").json()}
    assert set(by) == {"2026-01", "2026-02", "2026-03"}
    assert by["2026-01"]["visits"] == 2
    assert by["2026-01"]["people_reached"] == 55
    assert by["2026-02"]["visits"] == 1
    assert by["2026-03"]["visits"] == 1
    assert all(p["planned_visits"] == 0 for p in by.values())


def test_timeseries_includes_planned_series(seeded, client):
    # A scheduled (planned) visit appears as planned_visits, kept separate from
    # the completed count so the plot can draw it as a dotted line (#28).
    venue = create_venue(client, name="Future School", city="Later")
    create_visit(
        client, venue["id"], status="planned", visit_date="2026-12-01", people_reached=0
    )
    by = {p["period"]: p for p in client.get("/api/stats/timeseries").json()}
    assert by["2026-12"]["planned_visits"] == 1
    assert by["2026-12"]["visits"] == 0


def test_timeseries_half_year_for_wide_span(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], visit_date="2018-02-01", people_reached=10)
    create_visit(client, venue["id"], visit_date="2026-05-01", people_reached=20)
    # An 8-year span falls back to half-year buckets.
    periods = [p["period"] for p in client.get("/api/stats/timeseries").json()]
    assert periods == ["2018 H1", "2026 H1"]


def test_breakdowns(seeded, client):
    by_venue_type = {
        r["key"]: r for r in client.get("/api/stats/breakdown", params={"by": "venue_type"}).json()
    }
    assert by_venue_type["elementary_school"]["visits"] == 2
    assert by_venue_type["community_college"]["people_reached"] == 145

    by_event = {
        r["key"]: r for r in client.get("/api/stats/breakdown", params={"by": "event_type"}).json()
    }
    assert by_event["public_lecture"]["visits"] == 1
    assert by_event["classroom_visit"]["visits"] == 3

    by_audience = {
        r["key"]: r
        for r in client.get("/api/stats/breakdown", params={"by": "audience_level"}).json()
    }
    assert by_audience["elementary"]["visits"] == 2


def test_top_venues_and_leaderboard(seeded, client):
    top = client.get("/api/stats/top-venues").json()
    assert len(top) == 2
    assert top[0]["visits"] == 2

    board = client.get("/api/stats/leaderboard").json()
    assert board[0]["user"]["name"] == "Ada"
    assert board[0]["visits"] == 3
    assert board[1]["user"]["name"] == "Grace"
    assert board[1]["people_reached"] == 45


def test_stats_filters(client):
    from tests.conftest import create_venue, create_visit, register

    register(client)
    school = create_venue(client, name="Filter School", venue_type="high_school", city="Memphis")
    museum = create_venue(client, name="Filter Museum", venue_type="museum", city="Memphis")
    create_visit(client, school["id"], title="S1", people_reached=10,
                 event_type="classroom_visit", audience_level="high_school", tags=["alpha"])
    create_visit(client, museum["id"], title="M1", people_reached=100,
                 event_type="lab_tour", audience_level="general_public", tags=["beta"])

    # venue_type filter
    s = client.get("/api/stats/summary", params={"venue_type": "museum"}).json()
    assert s["total_visits"] == 1 and s["total_people_reached"] == 100
    # event_type filter
    s = client.get("/api/stats/summary", params={"event_type": "classroom_visit"}).json()
    assert s["total_visits"] == 1 and s["total_people_reached"] == 10
    # tag filter
    s = client.get("/api/stats/summary", params={"tags": "beta"}).json()
    assert s["total_visits"] == 1 and s["total_people_reached"] == 100
    # audience filter feeds breakdown too
    b = client.get("/api/stats/breakdown", params={"by": "venue_type", "audience_level": "high_school"}).json()
    assert len(b) == 1 and b[0]["key"] == "high_school"


def test_stats_multiselect_filters(client):
    """Each category filter accepts several values at once, OR-ed together (#13);
    a single value still works, and unknown values in the list are ignored."""
    from tests.conftest import create_venue, create_visit, register

    register(client)
    school = create_venue(client, name="MS School", venue_type="high_school", city="Nashville")
    museum = create_venue(client, name="MS Museum", venue_type="museum", city="Nashville")
    library = create_venue(client, name="MS Library", venue_type="library", city="Nashville")
    create_visit(client, school["id"], title="A", people_reached=10,
                 event_type="classroom_visit", audience_level="high_school")
    create_visit(client, museum["id"], title="B", people_reached=20,
                 event_type="lab_tour", audience_level="general_public")
    create_visit(client, library["id"], title="C", people_reached=30,
                 event_type="public_lecture", audience_level="educators")

    s = client.get("/api/stats/summary", params={"venue_type": "museum"}).json()
    assert s["total_visits"] == 1 and s["total_people_reached"] == 20
    s = client.get("/api/stats/summary", params={"venue_type": "museum,library"}).json()
    assert s["total_visits"] == 2 and s["total_people_reached"] == 50
    s = client.get("/api/stats/summary", params={"event_type": "classroom_visit,public_lecture"}).json()
    assert s["total_visits"] == 2 and s["total_people_reached"] == 40
    s = client.get("/api/stats/summary", params={"audience_level": "high_school,general_public"}).json()
    assert s["total_visits"] == 2 and s["total_people_reached"] == 30
    # Unknown values are dropped; the valid one still filters.
    s = client.get("/api/stats/summary", params={"venue_type": "museum,bogus"}).json()
    assert s["total_visits"] == 1

    # The multi-select feeds the breakdowns too.
    b = client.get("/api/stats/breakdown",
                   params={"by": "venue_type", "venue_type": "museum,library"}).json()
    assert {r["key"] for r in b} == {"museum", "library"}


def test_stats_people_search(client):
    """The analysis people search matches the communicator (author), the host,
    and free-text additional presenters (#13)."""
    from tests.conftest import create_venue, create_visit, register

    register(client, name="Ada Author")
    venue = create_venue(client, name="PS Venue")
    create_visit(client, venue["id"], title="Talk", people_reached=15,
                 contact_name="Bruno Host", additional_presenters="Carla Copresenter")
    create_visit(client, venue["id"], title="Other", people_reached=5)

    # Both visits share the same author.
    assert client.get("/api/stats/summary", params={"q": "Ada"}).json()["total_visits"] == 2
    # Host and additional-presenter names only match the first visit.
    assert client.get("/api/stats/summary", params={"q": "bruno"}).json()["total_visits"] == 1
    assert client.get("/api/stats/summary", params={"q": "Carla"}).json()["total_visits"] == 1
    assert client.get("/api/stats/summary", params={"q": "Nobody"}).json()["total_visits"] == 0


def test_remote_reach_split(client):
    """is_broadcast splits people-reached in the summary and timeseries (#38)."""
    from tests.conftest import create_venue, create_visit, register
    register(client)
    venue = create_venue(client)
    # 100 in person + 5,000 remote (a podcast) on the same month.
    create_visit(client, venue["id"], visit_date="2026-03-10", people_reached=100)
    create_visit(
        client, venue["id"], visit_date="2026-03-12", people_reached=5000, is_broadcast=True
    )

    summary = client.get("/api/stats/summary").json()
    assert summary["total_people_reached"] == 5100
    assert summary["total_people_reached_remote"] == 5000

    ts = client.get("/api/stats/timeseries").json()
    march = next(p for p in ts if p["period"].startswith("2026"))
    assert march["people_reached"] == 5100
    assert march["people_reached_remote"] == 5000


def test_is_broadcast_roundtrips(client):
    from tests.conftest import create_venue, create_visit, register
    register(client)
    venue = create_venue(client)
    v = create_visit(client, venue["id"], is_broadcast=True)
    assert v["is_broadcast"] is True
    got = client.get(f"/api/visits/{v['id']}").json()
    assert got["is_broadcast"] is True
    # Toggle off via PATCH.
    upd = client.patch(f"/api/visits/{v['id']}", json={"is_broadcast": False}).json()
    assert upd["is_broadcast"] is False
