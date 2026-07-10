from tests.conftest import create_venue, create_visit, register


def test_create_and_get_visit(client):
    register(client)
    venue = create_venue(client)
    visit = create_visit(
        client,
        venue["id"],
        contact_name="Ms. Rivera",
        contact_email="rivera@school.example",
        rating=5,
        reflection="Great questions from the kids.",
    )
    assert visit["venue"]["name"] == "Lincoln Elementary"
    assert visit["author"]["name"] == "Test User"
    assert visit["rating"] == 5

    fetched = client.get(f"/api/visits/{visit['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["contact_name"] == "Ms. Rivera"


def test_venue_dedupe_conflict(client):
    register(client)
    create_venue(client)
    response = client.post(
        "/api/venues",
        json={"name": "Lincoln Elementary", "venue_type": "elementary_school", "city": "Knoxville"},
    )
    assert response.status_code == 409


def test_visit_requires_auth(client):
    response = client.get("/api/visits")
    assert response.status_code == 401


def test_filters_and_pagination(client):
    register(client)
    school = create_venue(client)
    college = create_venue(
        client, name="Pellissippi State", venue_type="community_college"
    )
    for day in ("2026-01-10", "2026-02-10", "2026-03-10"):
        create_visit(client, school["id"], visit_date=day)
    create_visit(
        client,
        college["id"],
        visit_date="2026-03-20",
        audience_level="community_college",
        people_reached=80,
    )

    all_visits = client.get("/api/visits").json()
    assert all_visits["total"] == 4

    march = client.get(
        "/api/visits", params={"date_from": "2026-03-01", "date_to": "2026-03-31"}
    ).json()
    assert march["total"] == 2

    by_type = client.get("/api/visits", params={"venue_type": "community_college"}).json()
    assert by_type["total"] == 1
    assert by_type["items"][0]["venue"]["name"] == "Pellissippi State"

    paged = client.get("/api/visits", params={"page": 2, "page_size": 3}).json()
    assert paged["total"] == 4
    assert len(paged["items"]) == 1

    sorted_asc = client.get("/api/visits", params={"sort": "visit_date"}).json()
    dates = [item["visit_date"] for item in sorted_asc["items"]]
    assert dates == sorted(dates)


def test_only_author_or_admin_can_modify(client, make_client):
    register(client, email="admin@example.com")  # first user = admin
    author = make_client()
    register(author, email="author@example.com")
    stranger = make_client()
    register(stranger, email="stranger@example.com")

    venue = create_venue(author)
    visit = create_visit(author, venue["id"])

    denied = stranger.patch(f"/api/visits/{visit['id']}", json={"title": "Hijacked"})
    assert denied.status_code == 403
    assert stranger.delete(f"/api/visits/{visit['id']}").status_code == 403

    by_author = author.patch(f"/api/visits/{visit['id']}", json={"people_reached": 42})
    assert by_author.status_code == 200
    assert by_author.json()["people_reached"] == 42

    by_admin = client.patch(f"/api/visits/{visit['id']}", json={"title": "Fixed title"})
    assert by_admin.status_code == 200

    assert author.delete(f"/api/visits/{visit['id']}").status_code == 204
    assert client.get(f"/api/visits/{visit['id']}").status_code == 404


def test_csv_export(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], visit_date="2026-01-05")
    create_visit(client, venue["id"], visit_date="2026-02-05", people_reached=55)

    response = client.get("/api/visits/export.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    lines = response.text.strip().splitlines()
    assert len(lines) == 3  # header + 2 rows
    assert lines[0].startswith("date,title,event_type")

    filtered = client.get("/api/visits/export.csv", params={"date_from": "2026-02-01"})
    assert len(filtered.text.strip().splitlines()) == 2


def test_venue_detail_counts(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], visit_date="2026-01-05")
    create_visit(client, venue["id"], visit_date="2026-04-05")

    detail = client.get(f"/api/venues/{venue['id']}").json()
    assert detail["visit_count"] == 2
    assert detail["last_visit_date"] == "2026-04-05"


def test_venue_search(client):
    register(client)
    create_venue(client)
    create_venue(client, name="Museum of Science", venue_type="museum", city="Oak Ridge")

    hits = client.get("/api/venues", params={"q": "museum"}).json()
    assert hits["total"] == 1
    hits = client.get("/api/venues", params={"q": "knox"}).json()
    assert hits["total"] == 1
    assert hits["items"][0]["name"] == "Lincoln Elementary"
