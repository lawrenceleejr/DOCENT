import app.routers.geocode as geocode_router
from app.services.photon import PlaceSuggestion, parse_photon_response
from tests.conftest import register

SAMPLE = {
    "type": "FeatureCollection",
    "features": [
        # A named place with a full address.
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-83.92, 35.96]},
            "properties": {
                "name": "Lincoln Elementary",
                "housenumber": "100",
                "street": "Main St",
                "city": "Knoxville",
                "state": "Tennessee",
                "country": "United States",
            },
        },
        # A bare address with no place name.
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-84.1, 35.9]},
            "properties": {
                "housenumber": "42",
                "street": "Oak Ave",
                "city": "Maryville",
                "state": "Tennessee",
                "country": "United States",
            },
        },
        # Missing coordinates -> skipped.
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": []},
            "properties": {"name": "Ghost Place"},
        },
        # No geometry at all -> skipped.
        {"type": "Feature", "properties": {"name": "No Geometry"}},
    ],
}


def test_parse_extracts_coords_in_lat_lon_order():
    results = parse_photon_response(SAMPLE)
    assert len(results) == 2  # the two coordinate-less features are skipped

    lincoln = results[0]
    # GeoJSON coordinates are [lon, lat] — confirm we swapped them back.
    assert lincoln.latitude == 35.96
    assert lincoln.longitude == -83.92
    assert lincoln.name == "Lincoln Elementary"
    assert lincoln.address == "100 Main St"
    assert lincoln.city == "Knoxville"
    assert lincoln.state == "Tennessee"
    assert lincoln.country == "United States"
    assert lincoln.label == "Lincoln Elementary, Knoxville, Tennessee"


def test_parse_falls_back_to_address_when_unnamed():
    results = parse_photon_response(SAMPLE)
    bare = results[1]
    assert bare.name is None
    assert bare.address == "42 Oak Ave"
    # No name, so the label falls back to city/state.
    assert bare.label == "Maryville, Tennessee"


def test_parse_handles_missing_features_key():
    assert parse_photon_response({}) == []


def test_geocode_search_endpoint(client, monkeypatch):
    register(client)

    monkeypatch.setattr(
        geocode_router,
        "search_places",
        lambda q, **kw: [
            PlaceSuggestion(
                label="Lincoln Elementary, Knoxville, Tennessee",
                name="Lincoln Elementary",
                address="100 Main St",
                city="Knoxville",
                state="Tennessee",
                country="United States",
                latitude=35.96,
                longitude=-83.92,
            )
        ],
    )

    resp = client.get("/api/geocode/search", params={"q": "Lincoln Elementary"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Lincoln Elementary"
    assert body[0]["latitude"] == 35.96
    assert body[0]["longitude"] == -83.92


def test_geocode_search_requires_auth(make_client):
    anon = make_client()
    resp = anon.get("/api/geocode/search", params={"q": "test"})
    assert resp.status_code == 401


def test_geocode_search_requires_min_length(client):
    register(client)
    resp = client.get("/api/geocode/search", params={"q": "a"})
    assert resp.status_code == 422
