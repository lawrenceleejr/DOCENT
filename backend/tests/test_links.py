from tests.conftest import create_venue, create_visit, register


def test_links_normalized_on_create(client):
    register(client)
    venue = create_venue(client)
    visit = create_visit(
        client,
        venue["id"],
        links=[
            {"url": "example.com/press", "category": "PRESS", "label": "Local news"},
            {"url": "https://twitter.com/x/status/1", "category": "social_media"},
            {"url": "https://blog.example.org", "category": "bogus"},
            {"url": "  ", "category": "press"},
        ],
    )
    links = visit["links"]
    assert len(links) == 3  # blank url dropped
    assert links[0]["url"] == "https://example.com/press"  # scheme prepended
    assert links[0]["category"] == "press"  # lowercased
    assert links[0]["label"] == "Local news"
    assert links[2]["category"] == "other"  # unknown category coerced


def test_links_round_trip_and_update(client):
    register(client)
    venue = create_venue(client)
    visit = create_visit(client, venue["id"])
    assert visit["links"] == []
    updated = client.patch(
        f"/api/visits/{visit['id']}",
        json={"links": [{"url": "https://youtu.be/abc", "category": "video"}]},
    ).json()
    assert updated["links"][0]["category"] == "video"


def test_report_includes_coverage(client):
    register(client)
    venue = create_venue(client)
    create_visit(
        client,
        venue["id"],
        title="Covered",
        links=[
            {"url": "https://n.example/a", "category": "press"},
            {"url": "https://x.example/b", "category": "social_media"},
        ],
    )
    create_visit(client, venue["id"], title="Uncovered")

    report = client.get(
        "/api/reports/activities", params={"format": "json", "scope": "all"}
    ).json()
    assert report["summary"]["activities_with_coverage"] == 1
    assert report["summary"]["coverage_counts"]["press"] == 1
    assert report["summary"]["coverage_counts"]["social_media"] == 1

    covered = next(r for r in report["rows"] if r["title"] == "Covered")
    assert "Press" in covered["coverage"]
    assert "Social media" in covered["coverage"]
    assert "n.example" in covered["coverage_links"]

    csv = client.get(
        "/api/reports/activities", params={"format": "csv", "scope": "all"}
    ).text
    assert "Coverage" in csv.splitlines()[0]
