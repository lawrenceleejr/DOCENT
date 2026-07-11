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
    assert summary["active_researchers"] == 2
    assert summary["avg_rating"] == 4.0

    january = client.get(
        "/api/stats/summary", params={"date_from": "2026-01-01", "date_to": "2026-01-31"}
    ).json()
    assert january["total_visits"] == 2
    assert january["total_people_reached"] == 55


def test_timeseries_half_year_buckets(seeded, client):
    # Seeded visits (Jan/Feb/Mar 2026) all fall in the first half of 2026.
    points = client.get("/api/stats/timeseries").json()
    assert points == [{"period": "2026 H1", "visits": 4, "people_reached": 200}]

    # A July visit lands in the second half and forms its own bucket.
    venue = create_venue(client, name="Oak Ridge HS", venue_type="high_school", city="Oak Ridge")
    create_visit(
        client, venue["id"], visit_date="2026-09-15", people_reached=60,
        audience_level="high_school",
    )
    points = client.get("/api/stats/timeseries").json()
    assert [p["period"] for p in points] == ["2026 H1", "2026 H2"]
    assert points[1] == {"period": "2026 H2", "visits": 1, "people_reached": 60}


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
