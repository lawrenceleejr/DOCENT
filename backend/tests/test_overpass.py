from app.models import InstitutionType
from app.services.overpass import build_query, parse_elements

SAMPLE = [
    # A node school with full address tags.
    {
        "type": "node", "id": 1, "lat": 35.96, "lon": -83.92,
        "tags": {
            "amenity": "school", "name": "Lincoln Elementary",
            "addr:housenumber": "100", "addr:street": "Main St",
            "addr:city": "Knoxville", "addr:state": "TN",
            "website": "https://lincoln.example",
        },
    },
    # A way college with a center centroid.
    {
        "type": "way", "id": 2, "center": {"lat": 35.9, "lon": -84.1},
        "tags": {"amenity": "college", "name": "Pellissippi State"},
    },
    # A museum via tourism tag.
    {
        "type": "node", "id": 3, "lat": 36.0, "lon": -84.27,
        "tags": {"tourism": "museum", "name": "Museum of Science"},
    },
    # Unnamed -> skipped.
    {"type": "node", "id": 4, "lat": 35.0, "lon": -84.0, "tags": {"amenity": "school"}},
    # No coordinates -> skipped.
    {"type": "way", "id": 5, "tags": {"amenity": "library", "name": "Ghost Library"}},
    # A library.
    {
        "type": "node", "id": 6, "lat": 36.01, "lon": -84.27,
        "tags": {"amenity": "library", "name": "Oak Ridge Public Library"},
    },
]


def test_parse_maps_types_and_skips_invalid():
    rows = parse_elements(SAMPLE)
    assert len(rows) == 4  # 6 minus the unnamed and the coordinate-less one

    by_name = {r.name: r for r in rows}
    assert by_name["Lincoln Elementary"].institution_type is InstitutionType.school
    assert by_name["Pellissippi State"].institution_type is InstitutionType.college
    assert by_name["Museum of Science"].institution_type is InstitutionType.museum
    assert by_name["Oak Ridge Public Library"].institution_type is InstitutionType.library


def test_parse_extracts_coords_address_and_external_id():
    rows = {r.name: r for r in parse_elements(SAMPLE)}
    school = rows["Lincoln Elementary"]
    assert school.external_id == "node/1"
    assert (school.latitude, school.longitude) == (35.96, -83.92)
    assert school.address == "100 Main St"
    assert school.city == "Knoxville"
    assert school.website == "https://lincoln.example"

    # way centroid resolves from `center`
    college = rows["Pellissippi State"]
    assert college.external_id == "way/2"
    assert (college.latitude, college.longitude) == (35.9, -84.1)


def test_build_query_includes_area_and_selected_types():
    q = build_query("Tennessee", ["school", "museum"])
    assert 'area["name"="Tennessee"]["admin_level"="4"]->.a;' in q
    assert '"amenity"="school"' in q
    assert '"tourism"="museum"' in q
    assert '"amenity"="college"' not in q  # not requested
    assert "out center tags;" in q
