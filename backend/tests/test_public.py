from tests.conftest import create_venue, create_visit, register


def test_public_page_disabled_by_default(client):
    assert client.get("/api/public/impact").status_code == 404


def test_public_impact_when_enabled(client, make_client):
    register(client)  # admin
    venue = create_venue(client)
    create_visit(client, venue["id"], title="Star party", people_reached=40)
    create_visit(client, venue["id"], title="Planned only", status="planned",
                 visit_date="2099-01-01", people_reached=0)
    client.patch(
        "/api/admin/settings",
        json={"public_page": True, "site_name": "Demo Physics Outreach"},
    )

    # Unauthenticated client can read it.
    anon = make_client()
    r = anon.get("/api/public/impact")
    assert r.status_code == 200
    body = r.json()
    assert body["site_name"] == "Demo Physics Outreach"
    assert body["total_visits"] == 1  # planned events excluded
    assert body["total_people_reached"] == 40
    assert body["recent"][0]["title"] == "Star party"
    # report-safe: no notes/ratings/authors in the payload
    assert "rating" not in body["recent"][0]
    assert "author" not in body["recent"][0]


def test_public_page_toggle_off_again(client, make_client):
    register(client)
    client.patch("/api/admin/settings", json={"public_page": True})
    anon = make_client()
    assert anon.get("/api/public/impact").status_code == 200
    client.patch("/api/admin/settings", json={"public_page": False})
    assert anon.get("/api/public/impact").status_code == 404


def test_site_name_in_auth_config(client):
    register(client)
    client.patch("/api/admin/settings", json={"site_name": "Lab Outreach"})
    cfg = client.get("/api/auth/config").json()
    assert cfg["site_name"] == "Lab Outreach"
    assert cfg["public_page"] is False
