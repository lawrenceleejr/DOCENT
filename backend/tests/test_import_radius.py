import app.routers.admin as admin_router
from app.services.geocode import GeocodeResult, parse_latlon, to_meters
from app.services.overpass import ParsedInstitution, build_around_query
from app.models import InstitutionType
from tests.conftest import register


def test_parse_latlon():
    assert parse_latlon("35.96, -83.92") == (35.96, -83.92)
    assert parse_latlon("  35.96 ,-83.92 ") == (35.96, -83.92)
    assert parse_latlon("Knoxville, TN") is None
    assert parse_latlon("200, 0") is None  # out of range


def test_to_meters():
    assert to_meters(1, "km") == 1000
    assert round(to_meters(1, "mi")) == 1609


def test_build_around_query():
    q = build_around_query(35.96, -83.92, 40000, ["school", "library"])
    assert "around:40000,35.96,-83.92" in q
    assert '"amenity"="school"' in q
    assert '"amenity"="library"' in q
    assert '"amenity"="college"' not in q
    assert "out center tags;" in q


def _fake_parsed():
    return [
        ParsedInstitution(
            source="osm", external_id="node/nearby", name="Nearby School",
            institution_type=InstitutionType.school, latitude=35.97, longitude=-83.93,
            address=None, city="Knoxville", state="TN", country="USA",
            website=None, phone=None,
        )
    ]


def test_radius_import_endpoint(client, monkeypatch):
    register(client)  # first user = admin

    monkeypatch.setattr(
        admin_router, "geocode",
        lambda loc, **kw: GeocodeResult(35.96, -83.92, "Knoxville, TN, USA"),
    )
    monkeypatch.setattr(
        admin_router, "fetch_institutions_around",
        lambda lat, lon, radius_m, types, **kw: _fake_parsed(),
    )

    resp = client.post(
        "/api/admin/institutions/import",
        json={"location": "Knoxville", "radius": 25, "unit": "mi", "types": ["school"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["inserted"] == 1
    assert body["radius_km"] == 40.23  # 25 mi
    assert body["location"] == "Knoxville, TN, USA"
    assert "25mi of" in body["region"]

    # The imported institution shows up on the map as a gap.
    pts = client.get(
        "/api/map/institutions",
        params={"south": 35, "north": 36.5, "west": -84.5, "east": -83},
    ).json()
    assert any(p["name"] == "Nearby School" for p in pts)


def test_radius_import_rejects_too_large(client, monkeypatch):
    register(client)
    monkeypatch.setattr(
        admin_router, "geocode",
        lambda loc, **kw: GeocodeResult(0, 0, "x"),
    )
    resp = client.post(
        "/api/admin/institutions/import",
        json={"location": "x", "radius": 150, "unit": "km", "types": ["school"]},
    )
    assert resp.status_code == 400


def test_radius_import_unknown_type(client):
    register(client)
    resp = client.post(
        "/api/admin/institutions/import",
        json={"location": "x", "radius": 10, "unit": "km", "types": ["stadium"]},
    )
    assert resp.status_code == 422


def test_radius_import_admin_only(client, make_client):
    register(client, email="admin@example.com")
    other = make_client()
    register(other, email="pleb@example.com")
    resp = other.post(
        "/api/admin/institutions/import",
        json={"location": "x", "radius": 10, "unit": "km", "types": ["school"]},
    )
    assert resp.status_code == 403


def test_radius_import_location_not_found(client, monkeypatch):
    register(client)
    monkeypatch.setattr(admin_router, "geocode", lambda loc, **kw: None)
    resp = client.post(
        "/api/admin/institutions/import",
        json={"location": "nowhere-xyz", "radius": 10, "unit": "km", "types": ["school"]},
    )
    assert resp.status_code == 404
