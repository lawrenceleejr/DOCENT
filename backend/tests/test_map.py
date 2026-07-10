from app.models import Institution, InstitutionType
from tests.conftest import create_visit, register

# Knoxville-ish coordinates.
KNOX = {"latitude": 35.96, "longitude": -83.92}
FAR = {"latitude": 40.0, "longitude": -100.0}  # outside a TN bbox


def _add_institution(db, name, **over):
    fields = {
        "source": "osm",
        "external_id": f"node/{name}",
        "name": name,
        "institution_type": InstitutionType.school,
        "latitude": KNOX["latitude"],
        "longitude": KNOX["longitude"],
        "city": "Knoxville",
        "region": "Tennessee",
        **over,
    }
    inst = Institution(**fields)
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


def test_institution_bbox_and_coverage(client, db):
    register(client)
    gap = _add_institution(db, "Gap School")
    covered = _add_institution(db, "Covered School")
    _add_institution(db, "Far School", **FAR)

    # Link a venue+visit to `covered` so it counts as covered.
    venue = client.post(
        "/api/venues",
        json={
            "name": "Covered School", "venue_type": "elementary_school",
            "city": "Knoxville", "institution_id": covered.id,
        },
    ).json()
    assert venue["institution_id"] == covered.id
    create_visit(client, venue["id"])

    # Bbox around Knoxville excludes the Far School.
    bbox = {"south": 35, "north": 36.5, "west": -84.5, "east": -83}
    points = client.get("/api/map/institutions", params=bbox).json()
    names = {p["name"]: p for p in points}
    assert "Far School" not in names
    assert names["Covered School"]["covered"] is True
    assert names["Covered School"]["visit_count"] == 1
    assert names["Gap School"]["covered"] is False

    gaps = client.get("/api/map/institutions", params={**bbox, "status": "gap"}).json()
    assert {p["name"] for p in gaps} == {"Gap School"}

    covered_only = client.get(
        "/api/map/institutions", params={**bbox, "status": "covered"}
    ).json()
    assert {p["name"] for p in covered_only} == {"Covered School"}


def test_institution_type_filter(client, db):
    register(client)
    _add_institution(db, "A School", institution_type=InstitutionType.school)
    _add_institution(db, "A Library", institution_type=InstitutionType.library)

    only_libraries = client.get("/api/map/institutions", params={"types": "library"}).json()
    assert {p["name"] for p in only_libraries} == {"A Library"}


def test_map_venues_endpoint(client):
    register(client)
    v = client.post(
        "/api/venues",
        json={
            "name": "Mapped Venue", "venue_type": "museum", "city": "Knoxville",
            "latitude": 35.96, "longitude": -83.92,
        },
    ).json()
    create_visit(client, v["id"])
    # A venue with no coordinates should not appear on the map.
    client.post("/api/venues", json={"name": "No Coords", "venue_type": "library", "city": "X"})

    points = client.get("/api/map/venues").json()
    names = {p["name"]: p for p in points}
    assert "Mapped Venue" in names
    assert "No Coords" not in names
    assert names["Mapped Venue"]["visit_count"] == 1


def test_create_venue_with_bad_institution_404(client):
    register(client)
    r = client.post(
        "/api/venues",
        json={"name": "X", "venue_type": "library", "city": "Y", "institution_id": 99999},
    )
    assert r.status_code == 404
