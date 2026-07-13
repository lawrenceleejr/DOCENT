from tests.conftest import create_venue, create_visit, register


def _schedule(client, venue_id, **over):
    """Create a PLANNED (future) event without attendance."""
    payload = {
        "venue_id": venue_id,
        "status": "planned",
        "visit_date": "2027-05-01",
        "event_type": "lab_tour",
        "title": "Planned lab tour",
        "audience_level": "high_school",
        **over,
    }
    r = client.post("/api/visits", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_planned_visit_needs_no_attendance(client):
    register(client)
    venue = create_venue(client)
    visit = _schedule(client, venue["id"])
    assert visit["status"] == "planned"
    assert visit["people_reached"] == 0


def test_planned_excluded_from_stats_until_completed(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], visit_date="2026-02-01", people_reached=30)  # completed
    planned = _schedule(client, venue["id"], people_reached=0)

    summary = client.get("/api/stats/summary").json()
    assert summary["total_visits"] == 1  # planned not counted
    assert summary["total_people_reached"] == 30

    # Mark it completed with attendance → now it counts.
    client.patch(f"/api/visits/{planned['id']}", json={"status": "completed", "people_reached": 45})
    summary = client.get("/api/stats/summary").json()
    assert summary["total_visits"] == 2
    assert summary["total_people_reached"] == 75


def test_planned_does_not_mark_institution_covered(client, db):
    from app.models import Institution, InstitutionType

    register(client)
    inst = Institution(
        source="osm", external_id="node/sched", name="Sched School",
        institution_type=InstitutionType.school, latitude=35.96, longitude=-83.92,
        city="Knoxville", region="Tennessee",
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)

    venue = client.post(
        "/api/venues",
        json={"name": "Sched School", "venue_type": "high_school", "city": "Knoxville",
              "institution_id": inst.id},
    ).json()
    planned = _schedule(client, venue["id"])

    bbox = {"south": 35, "north": 36.5, "west": -84.5, "east": -83}
    pts = {p["name"]: p for p in client.get("/api/map/institutions", params=bbox).json()}
    assert pts["Sched School"]["covered"] is False  # still a gap while only planned

    client.patch(f"/api/visits/{planned['id']}", json={"status": "completed"})
    pts = {p["name"]: p for p in client.get("/api/map/institutions", params=bbox).json()}
    assert pts["Sched School"]["covered"] is True


def test_status_filter_on_list(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"])  # completed
    _schedule(client, venue["id"])

    assert client.get("/api/visits", params={"status": "planned"}).json()["total"] == 1
    assert client.get("/api/visits", params={"status": "completed"}).json()["total"] == 1
    assert client.get("/api/visits").json()["total"] == 2


def test_calendar_ics_endpoint(client, make_client):
    register(client, email="me@example.com")
    other = make_client()
    register(other, email="other@example.com")

    venue = create_venue(client)
    _schedule(client, venue["id"], title="My event", start_time="10:00", duration_minutes=60)
    create_visit(client, venue["id"])  # completed — not in the default planned scope
    _schedule(other, venue["id"], title="Not mine")  # another user's event

    resp = client.get("/api/visits/calendar.ics")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/calendar")
    assert "attachment" in resp.headers["content-disposition"]
    body = resp.text
    assert body.count("BEGIN:VEVENT") == 1  # only my planned event
    assert "SUMMARY:My event" in body
    assert "Not mine" not in body
    assert "DTSTART:20270501T100000" in body  # timed, floating

    # everyone=true exports the whole community's planned events
    all_resp = client.get("/api/visits/calendar.ics", params={"everyone": "true"})
    all_body = all_resp.text
    assert all_body.count("BEGIN:VEVENT") == 2
    assert "SUMMARY:My event" in all_body and "Not mine" in all_body
