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


def test_host_fields_roundtrip(client):
    register(client)
    venue = create_venue(client)
    visit = create_visit(
        client,
        venue["id"],
        contact_name="Dr. Patel",
        host_role="STEM coordinator",
        host_relationship="former_student",
        host_relationship_detail="did her PhD in our group",
        contact_email="patel@school.example",
        host_notes="Met at the 2024 outreach fair; keen on annual visits.",
    )
    assert visit["host_role"] == "STEM coordinator"
    assert visit["host_relationship"] == "former_student"
    assert visit["host_relationship_detail"] == "did her PhD in our group"
    assert visit["host_notes"].startswith("Met at the 2024")

    fetched = client.get(f"/api/visits/{visit['id']}").json()
    assert fetched["contact_name"] == "Dr. Patel"
    assert fetched["host_relationship"] == "former_student"

    # Invalid relationship value is rejected.
    bad = client.post(
        "/api/visits",
        json={
            "venue_id": venue["id"], "visit_date": "2026-03-14",
            "event_type": "classroom_visit", "title": "Bad host",
            "people_reached": 10, "audience_level": "elementary",
            "host_relationship": "buddy",
        },
    )
    assert bad.status_code == 422


def test_host_relationship_breakdown(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], host_relationship="teacher_faculty")
    create_visit(client, venue["id"], host_relationship="teacher_faculty")
    create_visit(client, venue["id"], host_relationship="alumnus")
    create_visit(client, venue["id"])  # no relationship -> excluded

    rows = {
        r["key"]: r["visits"]
        for r in client.get(
            "/api/stats/breakdown", params={"by": "host_relationship"}
        ).json()
    }
    assert rows == {"teacher_faculty": 2, "alumnus": 1}


def test_visit_keyword_search(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], title="Liquid nitrogen demos")
    create_visit(
        client, venue["id"], title="Coding workshop",
        description="Taught Python basics",
    )
    create_visit(
        client, venue["id"], title="Career day",
        reflection="Great turnout, want to bring a telescope next time",
    )

    assert client.get("/api/visits", params={"q": "nitrogen"}).json()["total"] == 1
    assert client.get("/api/visits", params={"q": "python"}).json()["total"] == 1
    assert client.get("/api/visits", params={"q": "telescope"}).json()["total"] == 1
    assert client.get("/api/visits", params={"q": "nonexistent"}).json()["total"] == 0


def test_people_reached_cap(client):
    register(client)
    venue = create_venue(client)
    ok = client.post(
        "/api/visits",
        json={
            "venue_id": venue["id"], "visit_date": "2026-03-14",
            "event_type": "classroom_visit", "title": "Big event",
            "people_reached": 100000, "audience_level": "elementary",
        },
    )
    assert ok.status_code == 201
    too_many = client.post(
        "/api/visits",
        json={
            "venue_id": venue["id"], "visit_date": "2026-03-14",
            "event_type": "classroom_visit", "title": "Typo event",
            "people_reached": 100001, "audience_level": "elementary",
        },
    )
    assert too_many.status_code == 422


def test_venue_delete(client, make_client):
    register(client, email="admin@example.com")  # admin
    creator = make_client()
    register(creator, email="creator@example.com")
    stranger = make_client()
    register(stranger, email="stranger@example.com")

    venue = create_venue(creator, name="Deletable Hall", city="Nowhere")

    # A stranger cannot delete someone else's venue.
    assert stranger.delete(f"/api/venues/{venue['id']}").status_code == 403

    # A venue with visits cannot be deleted (409).
    create_visit(creator, venue["id"])
    blocked = creator.delete(f"/api/venues/{venue['id']}")
    assert blocked.status_code == 409

    # An empty venue can be deleted by its creator.
    empty = create_venue(creator, name="Empty Hall", city="Nowhere")
    assert creator.delete(f"/api/venues/{empty['id']}").status_code == 204
    assert creator.get(f"/api/venues/{empty['id']}").status_code == 404


def test_venue_list_includes_visit_count(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"])
    create_visit(client, venue["id"])
    empty = create_venue(client, name="Quiet Library", venue_type="library", city="Elsewhere")

    by_id = {v["id"]: v for v in client.get("/api/venues").json()["items"]}
    assert by_id[venue["id"]]["visit_count"] == 2
    assert by_id[empty["id"]]["visit_count"] == 0


def test_admin_reset_password(client, make_client):
    register(client, email="admin@example.com")  # admin
    target = make_client()
    user_id = register(target, email="forgetful@example.com", password="password123").json()["id"]

    result = client.post(f"/api/admin/users/{user_id}/reset-password")
    assert result.status_code == 200
    temp = result.json()["temporary_password"]
    assert temp

    # Old password no longer works; the temporary one does.
    assert target.post(
        "/api/auth/login",
        json={"email": "forgetful@example.com", "password": "password123"},
    ).status_code == 401
    assert target.post(
        "/api/auth/login",
        json={"email": "forgetful@example.com", "password": temp},
    ).status_code == 200


def test_non_admin_cannot_reset_password(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    uid = register(other, email="other@example.com").json()["id"]
    assert other.post(f"/api/admin/users/{uid}/reset-password").status_code == 403


def test_venue_search(client):
    register(client)
    create_venue(client)
    create_venue(client, name="Museum of Science", venue_type="museum", city="Oak Ridge")

    hits = client.get("/api/venues", params={"q": "museum"}).json()
    assert hits["total"] == 1
    hits = client.get("/api/venues", params={"q": "knox"}).json()
    assert hits["total"] == 1
    assert hits["items"][0]["name"] == "Lincoln Elementary"
