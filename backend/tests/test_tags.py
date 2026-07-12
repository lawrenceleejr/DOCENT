from tests.conftest import create_venue, create_visit, register


def test_tags_normalized_on_create(client):
    register(client)
    venue = create_venue(client)
    visit = create_visit(
        client, venue["id"], tags=["  STEM ", "girls-in-stem", "stem", ""]
    )
    # lowercased, trimmed, de-duped, blanks dropped
    assert visit["tags"] == ["stem", "girls-in-stem"]


def test_filter_visits_by_tag(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], title="Tagged", tags=["nsf-career"])
    create_visit(client, venue["id"], title="Untagged")

    hit = client.get("/api/visits", params={"tags": "nsf-career"}).json()
    assert hit["total"] == 1
    assert hit["items"][0]["title"] == "Tagged"

    # any-match across multiple tags
    both = client.get("/api/visits", params={"tags": "nsf-career,other"}).json()
    assert both["total"] == 1


def test_list_distinct_tags(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], title="A", tags=["zeta", "alpha"])
    create_visit(client, venue["id"], title="B", tags=["alpha"])
    tags = client.get("/api/visits/tags").json()
    assert tags == ["alpha", "zeta"]  # distinct, sorted


def test_report_has_tags_and_filters(client):
    register(client)
    venue = create_venue(client)
    create_visit(client, venue["id"], title="Booth", tags=["expo"])
    create_visit(client, venue["id"], title="Zzz Solo Talk")

    csv = client.get(
        "/api/reports/activities", params={"format": "csv", "scope": "all"}
    ).text
    assert "Tags" in csv.splitlines()[0]
    assert "expo" in csv

    filtered = client.get(
        "/api/reports/activities",
        params={"format": "csv", "scope": "all", "tags": "expo"},
    ).text
    assert "Booth" in filtered
    assert "Zzz Solo Talk" not in filtered
