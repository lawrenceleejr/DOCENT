"""Small public reference endpoints backing the registration + profile
autocompletes (#22). They stay unauthenticated because the registration page
needs them before an account exists; they only ever return position titles and
institution names (reference/organization data), never personal details."""
from fastapi import APIRouter
from sqlalchemy import distinct, select

from app.deps import DbSession
from app.models import Institution, User

router = APIRouter(prefix="/api/meta", tags=["meta"])

# A curated base list so even a brand-new instance with no data offers useful
# position suggestions. The field is a free-text Autocomplete, so "other" is
# simply typing something not on the list.
COMMON_POSITIONS = [
    "Professor",
    "Associate Professor",
    "Assistant Professor",
    "Postdoctoral Researcher",
    "PhD Student",
    "Graduate Student",
    "Undergraduate Student",
    "Research Scientist",
    "Research Staff",
    "Lecturer",
    "Instructor",
    "Outreach Coordinator",
    "Science Communicator",
    "Teacher",
    "Emeritus",
]


def _merged(*sources: list[str], limit: int = 200) -> list[str]:
    """Case-insensitively dedupe across sources, keep the first spelling seen,
    and return sorted (case-insensitive)."""
    seen: dict[str, str] = {}
    for src in sources:
        for value in src:
            if not value:
                continue
            trimmed = value.strip()
            key = trimmed.lower()
            if key and key not in seen:
                seen[key] = trimmed
    return sorted(seen.values(), key=str.lower)[:limit]


@router.get("/positions", response_model=list[str])
def positions(db: DbSession):
    """Position suggestions: a curated base list plus positions already in use."""
    used = db.scalars(
        select(distinct(User.position)).where(User.position.isnot(None))
    ).all()
    return _merged(COMMON_POSITIONS, used)


@router.get("/institutions", response_model=list[str])
def institutions(db: DbSession):
    """Institution suggestions: the imported catalog plus affiliations members
    have already entered, so people can pick an existing institution (#22)."""
    catalog = db.scalars(
        select(distinct(Institution.name)).where(Institution.name.isnot(None))
    ).all()
    affiliations = db.scalars(
        select(distinct(User.affiliation)).where(User.affiliation.isnot(None))
    ).all()
    return _merged(catalog, affiliations)
