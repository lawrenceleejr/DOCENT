"""Seed a realistic demo dataset (fictional communicators, venues, and visits).

For demos, talks, and evaluating DOCENT — fills the Visits list, Schedule,
Analysis charts, Map (venue dots), and Reports with plausible data.

    docker compose exec backend python -m app.scripts.seed_demo
    # or locally:  python -m app.scripts.seed_demo

Safe to re-run: it goes through the same merge-import used by the admin
"Import & merge" tool, so existing records are matched by natural key and
never duplicated. Demo authors are created INACTIVE (they can't log in).
"""
from __future__ import annotations

from datetime import date, timedelta

from app.database import SessionLocal
from app.services.dbtransfer import import_data

TODAY = date.today()

USERS = [
    {"email": "demo.ada@example.org", "name": "Ada Alvarez", "affiliation": "Dept. of Physics"},
    {"email": "demo.ben@example.org", "name": "Ben Okafor", "affiliation": "Dept. of Physics"},
    {"email": "demo.carla@example.org", "name": "Carla Nguyen", "affiliation": "Science Outreach Office"},
    {"email": "demo.dev@example.org", "name": "Dev Ramaswamy", "affiliation": "Dept. of Astronomy"},
]

# Fictional-but-plausible Knoxville-area venues, with coordinates for the map.
VENUES = [
    {"name": "West Hills Elementary (demo)", "venue_type": "elementary_school", "city": "Knoxville", "state": "TN", "latitude": 35.945, "longitude": -84.02},
    {"name": "Cedar Ridge Middle School (demo)", "venue_type": "middle_school", "city": "Oak Ridge", "state": "TN", "latitude": 36.01, "longitude": -84.25},
    {"name": "Riverbend High School (demo)", "venue_type": "high_school", "city": "Knoxville", "state": "TN", "latitude": 35.99, "longitude": -83.90},
    {"name": "Valley State Community College (demo)", "venue_type": "community_college", "city": "Maryville", "state": "TN", "latitude": 35.75, "longitude": -83.97},
    {"name": "Discovery Science Museum (demo)", "venue_type": "museum", "city": "Knoxville", "state": "TN", "latitude": 35.965, "longitude": -83.92},
    {"name": "Fountain City Public Library (demo)", "venue_type": "library", "city": "Knoxville", "state": "TN", "latitude": 36.04, "longitude": -83.93},
    {"name": "Southside Community Center (demo)", "venue_type": "community_center", "city": "Knoxville", "state": "TN", "latitude": 35.94, "longitude": -83.89},
    {"name": "Lakeview High School (demo)", "venue_type": "high_school", "city": "Lenoir City", "state": "TN", "latitude": 35.79, "longitude": -84.26},
]

TITLES = [
    ("Why the sky is blue", "classroom_visit", "elementary"),
    ("Particle physics show-and-tell", "classroom_visit", "middle_school"),
    ("Careers in science panel", "career_day", "high_school"),
    ("Liquid nitrogen demo booth", "demo_booth", "general_public"),
    ("Telescope night", "public_lecture", "general_public"),
    ("Build a spectroscope", "workshop", "high_school"),
    ("Lab tour: the accelerator hall", "lab_tour", "high_school"),
    ("Science fair judging", "science_fair", "middle_school"),
    ("Intro to coding with sensors", "workshop", "community_college"),
    ("Ask a physicist AMA", "public_lecture", "educators"),
]

TAG_SETS = [["nsf-career"], ["physics-day"], ["nsf-career", "girls-in-stem"], [], ["dark-matter-day"], []]

LINK_SETS = [
    [],
    [],
    [],
    [{"url": "https://example.org/news/science-night", "category": "press", "label": "Local paper writeup (demo)"}],
    [{"url": "https://example.org/social/post123", "category": "social_media", "label": "Event thread (demo)"}],
    [],
]

# Most visits are in English (None -> omitted); a few show up in other
# languages so the language filter/picker has something to demo.
LANGUAGES = [None, None, None, "Spanish", None, None, "French", None, None, None, "Vietnamese"]


def build_payload() -> dict:
    visits = []
    # ~30 months of history, one event every ~18 days, deterministic variety.
    start = TODAY - timedelta(days=30 * 30)
    d = start
    i = 0
    while d < TODAY - timedelta(days=7):
        title, event_type, audience = TITLES[i % len(TITLES)]
        venue = VENUES[(i * 3) % len(VENUES)]
        author = USERS[i % len(USERS)]
        visits.append(
            {
                "author_email": author["email"],
                "venue": {"name": venue["name"], "city": venue["city"]},
                "status": "completed",
                "visit_date": d.isoformat(),
                "start_time": ["09:30", "13:00", "18:00"][i % 3],
                "event_type": event_type,
                "title": title,
                "people_reached": 15 + (i * 17) % 90,
                "audience_level": audience,
                "language": LANGUAGES[i % len(LANGUAGES)],
                "duration_minutes": [45, 60, 90][i % 3],
                "rating": [4, 5, 3, 5, 4][i % 5],
                "additional_presenters": USERS[(i + 1) % len(USERS)]["name"] if i % 4 == 0 else None,
                "tags": TAG_SETS[i % len(TAG_SETS)],
                "links": LINK_SETS[i % len(LINK_SETS)],
            }
        )
        d += timedelta(days=18)
        i += 1

    # A handful of upcoming planned events for the Schedule tab.
    for j, (title, event_type, audience) in enumerate(TITLES[:4]):
        venue = VENUES[(j * 2 + 1) % len(VENUES)]
        visits.append(
            {
                "author_email": USERS[j % len(USERS)]["email"],
                "venue": {"name": venue["name"], "city": venue["city"]},
                "status": "planned",
                "visit_date": (TODAY + timedelta(days=10 + j * 9)).isoformat(),
                "start_time": "10:00",
                "event_type": event_type,
                "title": f"{title} (upcoming)",
                "people_reached": 0,
                "audience_level": audience,
                "duration_minutes": 60,
                "tags": ["fall-series"],
            }
        )

    return {
        "docent_export_version": 1,
        "users": USERS,
        "institutions": [],
        "venues": VENUES,
        "visits": visits,
    }


def main() -> None:
    db = SessionLocal()
    try:
        counts = import_data(db, build_payload())
        print("Demo data seeded (merge-import, re-running never duplicates):")
        for key, value in counts.items():
            print(f"  {key}: {value}")
        print("Demo authors are inactive placeholder accounts (no login).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
