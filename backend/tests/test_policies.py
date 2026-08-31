"""Admin-published policy documents (privacy policy, terms of use)."""
from tests.conftest import register


def _admin(client):
    """First registered user is the admin."""
    register(client, email="admin@example.com", name="Admin")
    return client


def test_nothing_is_published_by_default(client):
    """The shipped examples are a starting point, never the live default: a
    template served as a real policy would state retention periods and rights
    the institution has never reviewed."""
    assert client.get("/api/public/policy/privacy").status_code == 404
    assert client.get("/api/public/policy/terms").status_code == 404

    _admin(client)
    settings = client.get("/api/admin/settings").json()
    assert settings["policy_privacy"] == ""
    assert settings["policy_terms"] == ""


def test_unknown_slug_and_unpublished_are_indistinguishable(client):
    """Whether an admin has a draft in progress isn't public information."""
    unknown = client.get("/api/public/policy/not-a-document")
    unpublished = client.get("/api/public/policy/privacy")
    assert unknown.status_code == unpublished.status_code == 404
    assert unknown.json()["detail"] == unpublished.json()["detail"]


def test_publishing_makes_it_public_and_advertised(client):
    """A privacy policy has to be readable before you hand over an email to
    register, so the document is served unauthenticated, and the public config
    lists it so the footer can link it."""
    _admin(client)
    body = "# Privacy Policy\n\nWe keep **very little**.\n"
    client.patch("/api/admin/settings", json={"policy_privacy": body})

    got = client.get("/api/public/policy/privacy")
    assert got.status_code == 200
    assert got.json() == {"slug": "privacy", "body": body}

    config = client.get("/api/auth/config").json()
    assert config["published_policies"] == ["privacy"]
    # The other document is independent and stays unpublished.
    assert client.get("/api/public/policy/terms").status_code == 404


def test_markdown_round_trips_verbatim(client):
    """Leading whitespace and blank lines are meaningful in markdown, so the
    editor has to get back exactly what was saved."""
    _admin(client)
    body = "# T\n\n- a\n- b\n\n```\n  indented code\n```\n\n> quote\n"
    client.patch("/api/admin/settings", json={"policy_terms": body})
    assert client.get("/api/public/policy/terms").json()["body"] == body
    assert client.get("/api/admin/settings").json()["policy_terms"] == body


def test_clearing_unpublishes(client):
    """Emptying the editor has to take the page down and drop the footer link,
    not leave a stale document served."""
    _admin(client)
    client.patch("/api/admin/settings", json={"policy_privacy": "# Hi"})
    assert client.get("/api/public/policy/privacy").status_code == 200

    client.patch("/api/admin/settings", json={"policy_privacy": ""})
    assert client.get("/api/public/policy/privacy").status_code == 404
    assert client.get("/api/auth/config").json()["published_policies"] == []


def test_examples_are_admin_only(client, make_client):
    """The examples are editorial scaffolding, not something the instance
    publishes, so they aren't public."""
    assert make_client().get("/api/admin/policies/examples").status_code == 401

    _admin(client)
    examples = client.get("/api/admin/policies/examples").json()
    assert set(examples) == {"privacy", "terms"}
    # Substantial, and visibly a template rather than a finished policy.
    for slug, text in examples.items():
        assert len(text) > 500, slug
        assert "[" in text and "]" in text, f"{slug} has no fill-in placeholders"


def test_saving_a_policy_leaves_other_settings_alone(client):
    """The policy editor is its own card with its own save; it must not clobber
    settings it doesn't manage."""
    _admin(client)
    client.patch("/api/admin/settings", json={"site_name": "UTK Physics Outreach"})
    client.patch("/api/admin/settings", json={"policy_privacy": "# P"})
    assert client.get("/api/admin/settings").json()["site_name"] == "UTK Physics Outreach"
