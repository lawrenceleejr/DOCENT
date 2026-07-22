from tests.conftest import create_venue, create_visit, register


def test_add_school_creates_connection(client):
    register(client, email="admin@example.com", name="Ada Lovelace")
    venue = create_venue(client, name="Lincoln Elementary", city="Knoxville")

    r = client.post("/api/users/me/schools", json={"venue_id": venue["id"]})
    assert r.status_code == 201, r.text
    assert r.json()["venue"]["id"] == venue["id"]

    listed = client.get("/api/users/me/schools").json()
    assert len(listed) == 1
    assert listed[0]["venue"]["name"] == "Lincoln Elementary"

    connections = client.get("/api/connections", params={"venue_id": venue["id"]}).json()
    assert len(connections) == 1
    assert connections[0]["name"] == "Ada Lovelace"
    assert connections[0]["relationship_type"] == "alumnus"


def test_add_school_reuses_existing_connection(client):
    register(client, email="admin@example.com", name="Ada Lovelace")
    venue = create_venue(client)
    # Someone already logged this exact person as a host contact.
    existing = client.post(
        "/api/connections",
        json={"venue_id": venue["id"], "name": "Ada Lovelace", "role": "PTA president"},
    ).json()

    r = client.post("/api/users/me/schools", json={"venue_id": venue["id"]})
    assert r.status_code == 201, r.text

    connections = client.get("/api/connections", params={"venue_id": venue["id"]}).json()
    assert len(connections) == 1
    assert connections[0]["id"] == existing["id"]
    assert connections[0]["role"] == "PTA president"  # untouched


def test_add_school_duplicate_conflicts(client):
    register(client, email="admin@example.com")
    venue = create_venue(client)
    client.post("/api/users/me/schools", json={"venue_id": venue["id"]})
    r = client.post("/api/users/me/schools", json={"venue_id": venue["id"]})
    assert r.status_code == 409


def test_add_school_unknown_venue_404(client):
    register(client, email="admin@example.com")
    r = client.post("/api/users/me/schools", json={"venue_id": 999999})
    assert r.status_code == 404


def test_remove_school_keeps_connection(client):
    register(client, email="admin@example.com", name="Ada Lovelace")
    venue = create_venue(client)
    school = client.post("/api/users/me/schools", json={"venue_id": venue["id"]}).json()

    r = client.delete(f"/api/users/me/schools/{school['id']}")
    assert r.status_code == 204
    assert client.get("/api/users/me/schools").json() == []

    connections = client.get("/api/connections", params={"venue_id": venue["id"]}).json()
    assert len(connections) == 1  # the standing connection survives


def test_cannot_remove_another_users_school(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    register(other, email="other@example.com")
    venue = create_venue(client)
    school = other.post("/api/users/me/schools", json={"venue_id": venue["id"]}).json()

    assert client.delete(f"/api/users/me/schools/{school['id']}").status_code == 404


def test_languages_spoken_validation(client):
    register(client, email="admin@example.com")
    ok = client.patch("/api/users/me", json={"languages_spoken": ["Spanish", "French"]})
    assert ok.status_code == 200, ok.text
    assert sorted(ok.json()["languages_spoken"]) == ["French", "Spanish"]

    bad = client.patch("/api/users/me", json={"languages_spoken": ["Klingon"]})
    assert bad.status_code == 422


def test_directory_disabled_by_default(client, make_client):
    register(client, email="admin@example.com")  # admin can always see it
    assert client.get("/api/users/directory").status_code == 200

    other = make_client()
    register(other, email="member@example.com")
    assert other.get("/api/users/directory").status_code == 403


def test_directory_enabled_for_everyone(client, make_client):
    register(client, email="admin@example.com")
    client.patch("/api/admin/settings", json={"user_directory_visible": True})
    assert client.get("/api/auth/config").json()["user_directory_visible"] is True

    other = make_client()
    register(other, email="member@example.com")
    assert other.get("/api/users/directory").status_code == 200


def test_directory_filters(client, make_client):
    register(client, email="admin@example.com", name="Ada Lovelace")
    client.patch("/api/users/me", json={"languages_spoken": ["Spanish"]})
    venue = create_venue(client, name="Lincoln Elementary", city="Knoxville")
    client.post("/api/users/me/schools", json={"venue_id": venue["id"]})

    other = make_client()
    register(other, email="grace@example.com", name="Grace Hopper")
    other.patch("/api/users/me", json={"languages_spoken": ["French"]})

    by_language = client.get("/api/users/directory", params={"language": "Spanish"}).json()
    assert [u["name"] for u in by_language["items"]] == ["Ada Lovelace"]

    by_venue = client.get("/api/users/directory", params={"venue_id": venue["id"]}).json()
    assert [u["name"] for u in by_venue["items"]] == ["Ada Lovelace"]
    assert by_venue["items"][0]["schools"][0]["name"] == "Lincoln Elementary"

    by_q = client.get("/api/users/directory", params={"q": "grace"}).json()
    assert [u["name"] for u in by_q["items"]] == ["Grace Hopper"]

    # The directory never leaks email or account flags.
    assert "email" not in by_q["items"][0]


def test_admin_users_filters_and_schools(client, make_client):
    register(client, email="admin@example.com", name="Ada Lovelace")
    venue = create_venue(client, name="Lincoln Elementary", city="Knoxville")
    client.post("/api/users/me/schools", json={"venue_id": venue["id"]})
    client.patch("/api/users/me", json={"languages_spoken": ["Spanish"]})

    other = make_client()
    register(other, email="grace@example.com", name="Grace Hopper")

    admin_row = next(
        u for u in client.get("/api/admin/users").json()["items"] if u["email"] == "admin@example.com"
    )
    assert admin_row["languages_spoken"] == ["Spanish"]
    assert admin_row["schools"][0]["name"] == "Lincoln Elementary"

    by_venue = client.get("/api/admin/users", params={"venue_id": venue["id"]}).json()
    assert [u["email"] for u in by_venue["items"]] == ["admin@example.com"]

    by_language = client.get("/api/admin/users", params={"language": "Spanish"}).json()
    assert [u["email"] for u in by_language["items"]] == ["admin@example.com"]


def test_venue_merge_reassigns_schools_dedupes_collision(client, make_client):
    register(client, email="admin@example.com", name="Ada Lovelace")
    keep = create_venue(client, name="Lincoln Elementary", city="Knoxville")
    dup = create_venue(client, name="Lincoln Elem.", city="Knoxville")

    other = make_client()
    register(other, email="grace@example.com", name="Grace Hopper")
    # Grace attended the duplicate venue only -> should be reassigned.
    other.post("/api/users/me/schools", json={"venue_id": dup["id"]})
    # Ada attended both -> the dup-venue row should be dropped, not duplicated.
    client.post("/api/users/me/schools", json={"venue_id": keep["id"]})
    client.post("/api/users/me/schools", json={"venue_id": dup["id"]})

    r = client.post(f"/api/venues/{keep['id']}/merge", json={"from_ids": [dup["id"]]})
    assert r.status_code == 200, r.text

    grace_schools = other.get("/api/users/me/schools").json()
    assert [s["venue"]["id"] for s in grace_schools] == [keep["id"]]

    ada_schools = client.get("/api/users/me/schools").json()
    assert [s["venue"]["id"] for s in ada_schools] == [keep["id"]]  # not duplicated


def test_user_merge_reassigns_schools_dedupes_collision(client, make_client):
    admin = register(client, email="admin@example.com").json()
    venue_a = create_venue(client, name="Venue A")
    venue_b = create_venue(client, name="Venue B")

    other = make_client()
    dup = register(other, email="dup@example.com").json()
    other.post("/api/users/me/schools", json={"venue_id": venue_a["id"]})
    other.post("/api/users/me/schools", json={"venue_id": venue_b["id"]})
    # Admin already has venue_a -> that dup row should be dropped on merge.
    client.post("/api/users/me/schools", json={"venue_id": venue_a["id"]})

    r = client.post(f"/api/admin/users/{dup['id']}/merge", json={"into_id": admin["id"]})
    assert r.status_code == 200, r.text

    schools = {s["venue"]["id"] for s in client.get("/api/users/me/schools").json()}
    assert schools == {venue_a["id"], venue_b["id"]}
