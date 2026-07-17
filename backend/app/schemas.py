import re
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

MAX_TAGS = 30
MAX_TAG_LEN = 50
MAX_LINKS = 50

# Kinds of external coverage a visit can link to.
COVERAGE_CATEGORIES = ("press", "social_media", "video", "blog", "other")


def normalize_tags(tags: list[str] | None) -> list[str]:
    """Trim, lowercase, drop blanks, dedupe (stable), and cap tag lists."""
    if not tags:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for raw in tags:
        t = " ".join(str(raw).strip().lower().split())[:MAX_TAG_LEN]
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out[:MAX_TAGS]


class VisitLink(BaseModel):
    """An external link documenting coverage of a visit (press, social, …)."""

    url: str = Field(min_length=1, max_length=1000)
    category: str = "other"
    label: str | None = Field(default=None, max_length=200)

    @field_validator("url")
    @classmethod
    def _clean_url(cls, v: str) -> str:
        v = v.strip()
        if v and not re.match(r"^https?://", v, re.IGNORECASE):
            v = f"https://{v}"  # be forgiving: prepend scheme if missing
        return v[:1000]

    @field_validator("category")
    @classmethod
    def _clean_category(cls, v: str) -> str:
        v = (v or "").strip().lower()
        return v if v in COVERAGE_CATEGORIES else "other"

    @field_validator("label")
    @classmethod
    def _clean_label(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v[:200] or None


def normalize_links(links: list | None) -> list[dict]:
    """Validate/clean link dicts, drop blank URLs, cap the count. Returns plain
    JSON-serializable dicts (string category) for storage in the JSONB column."""
    if not links:
        return []
    out: list[dict] = []
    for raw in links:
        try:
            item = VisitLink.model_validate(raw)
        except Exception:
            continue
        if item.url:
            out.append(item.model_dump())
        if len(out) >= MAX_LINKS:
            break
    return out

from app.languages import LANGUAGE_SET
from app.models import (
    AudienceLevel,
    EventType,
    HostRelationship,
    InstitutionType,
    VenueType,
    VisitStatus,
)


def clean_language(v: str | None) -> str | None:
    """Trim and validate against the central LANGUAGE_SET; blank -> None."""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if v not in LANGUAGE_SET:
        raise ValueError(f"'{v}' is not an allowed language")
    return v


def clean_languages(values: list[str] | None) -> list[str]:
    """Validate each against LANGUAGE_SET (raises on an unknown one — these
    come from a fixed picker, not free text) and dedupe, order-preserving."""
    if not values:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for raw in values:
        v = (raw or "").strip()
        if not v:
            continue
        if v not in LANGUAGE_SET:
            raise ValueError(f"'{v}' is not an allowed language")
        if v not in seen:
            seen.add(v)
            out.append(v)
    return out


# --- Auth / users ---

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    affiliation: str | None = Field(default=None, max_length=255)
    invite_code: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthConfig(BaseModel):
    """Public, unauthenticated info the login/register pages need."""

    registration_enabled: bool
    contact_email: str | None
    site_name: str | None
    public_page: bool
    login_message: str | None
    map_center_lat: float
    map_center_lon: float
    user_directory_visible: bool


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    affiliation: str | None
    is_admin: bool
    is_active: bool
    languages_spoken: list[str]
    created_at: datetime


class UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    affiliation: str | None = Field(default=None, max_length=255)
    languages_spoken: list[str] | None = None
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("languages_spoken")
    @classmethod
    def _clean_languages_spoken(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else clean_languages(v)


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    email: EmailStr | None = None


class SchoolCreate(BaseModel):
    venue_id: int


class UserMergeRequest(BaseModel):
    into_id: int


class VenueMergeRequest(BaseModel):
    from_ids: list[int] = Field(min_length=1)


class InstitutionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    institution_type: InstitutionType
    # Either provide coordinates directly, or a location string to geocode.
    location: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    region: str = Field(default="Manual", max_length=120)


class InstitutionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    institution_type: InstitutionType | None = None
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)


class InstitutionAdminItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    institution_type: InstitutionType
    latitude: float
    longitude: float
    city: str | None
    state: str | None
    region: str | None
    source: str


class InstitutionAdminList(BaseModel):
    items: list[InstitutionAdminItem]
    total: int
    page: int
    page_size: int


class BackupItem(BaseModel):
    path: str
    tier: str
    size_bytes: int
    modified_at: datetime


class BackupList(BaseModel):
    items: list[BackupItem]
    count: int
    total_size_bytes: int
    last_backup_at: datetime | None


class DbImportResult(BaseModel):
    users_created: int
    institutions_created: int
    venues_created: int
    visits_created: int
    visits_skipped: int


class RegistrationSettings(BaseModel):
    invite_code: str
    contact_email: str
    site_url: str
    site_name: str
    public_page: bool
    login_message: str
    map_center_lat: float
    map_center_lon: float
    user_directory_visible: bool


class RegistrationSettingsUpdate(BaseModel):
    invite_code: str | None = None
    contact_email: str | None = None
    site_url: str | None = None
    site_name: str | None = Field(default=None, max_length=120)
    public_page: bool | None = None
    login_message: str | None = Field(default=None, max_length=2000)
    map_center_lat: float | None = Field(default=None, ge=-90, le=90)
    map_center_lon: float | None = Field(default=None, ge=-180, le=180)
    user_directory_visible: bool | None = None




class PasswordResetResult(BaseModel):
    user_id: int
    temporary_password: str


class InstitutionImportRequest(BaseModel):
    location: str = Field(min_length=1, max_length=300)
    radius: float = Field(gt=0, le=200)
    unit: Literal["km", "mi"] = "km"
    types: list[str] = Field(min_length=1)
    link_existing: bool = False


class InstitutionImportResult(BaseModel):
    location: str
    latitude: float
    longitude: float
    radius_km: float
    region: str
    inserted: int
    updated: int
    pruned: int
    linked_venues: int
    total_in_region: int


# --- Venues ---

class VenueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    venue_type: VenueType
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    country: str = Field(default="USA", max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    notes: str | None = None
    institution_id: int | None = None


class VenueUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    venue_type: VenueType | None = None
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    notes: str | None = None


class VenueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    venue_type: VenueType
    address: str | None
    city: str | None
    state: str | None
    country: str
    latitude: float | None
    longitude: float | None
    notes: str | None
    created_by_id: int | None
    institution_id: int | None
    created_at: datetime


class VenueBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    venue_type: VenueType
    city: str | None


class SchoolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    venue: VenueBrief
    created_at: datetime


class AdminUserOut(UserOut):
    schools: list[VenueBrief]


class AdminUserList(BaseModel):
    items: list[AdminUserOut]
    total: int
    page: int
    page_size: int


class DirectoryUserOut(BaseModel):
    """Member-directory-safe view of a user — no email, no account flags."""

    id: int
    name: str
    affiliation: str | None
    languages_spoken: list[str]
    schools: list[VenueBrief]


class DirectoryUserList(BaseModel):
    items: list[DirectoryUserOut]
    total: int
    page: int
    page_size: int


class VenueListItem(VenueOut):
    visit_count: int


class VenueDetail(VenueOut):
    visit_count: int
    last_visit_date: date | None


class VenueList(BaseModel):
    items: list[VenueListItem]
    total: int
    page: int
    page_size: int


class PlaceSuggestion(BaseModel):
    """One address/place autocomplete result — prefills a new venue's
    address fields, never its name or type (a geocoder can't reliably tell
    a middle school from a museum)."""

    label: str
    name: str | None
    address: str | None
    city: str | None
    state: str | None
    country: str | None
    latitude: float
    longitude: float


# --- Connections ---
# A standing personal-network contact at a venue (a teacher you know, an
# alum, a past host) — independent of any logged visit.

class ConnectionCreate(BaseModel):
    venue_id: int
    name: str = Field(min_length=1, max_length=255)
    role: str | None = Field(default=None, max_length=255)
    relationship_type: HostRelationship | None = None
    relationship_detail: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    notes: str | None = None


class ConnectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    role: str | None = Field(default=None, max_length=255)
    relationship_type: HostRelationship | None = None
    relationship_detail: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    notes: str | None = None


class ConnectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    venue_id: int
    name: str
    role: str | None
    relationship_type: HostRelationship | None
    relationship_detail: str | None
    email: str | None
    phone: str | None
    notes: str | None
    added_by: UserBrief | None
    created_at: datetime


# Sanity ceiling for a single outreach event's headcount — catches fat-finger
# entries (e.g. an extra zero) that would otherwise skew community totals.
MAX_PEOPLE_REACHED = 100_000


# --- Visits ---

class VisitCreate(BaseModel):
    venue_id: int
    status: VisitStatus = VisitStatus.completed
    visit_date: date
    start_time: time | None = None
    event_type: EventType
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    contact_name: str | None = Field(default=None, max_length=255)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=50)
    host_role: str | None = Field(default=None, max_length=255)
    host_relationship: HostRelationship | None = None
    host_relationship_detail: str | None = Field(default=None, max_length=500)
    host_notes: str | None = None
    # Optional so a *planned* event can be scheduled before attendance is known.
    people_reached: int = Field(default=0, ge=0, le=MAX_PEOPLE_REACHED)
    audience_level: AudienceLevel
    language: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    reflection: str | None = None
    follow_up_planned: bool = False
    additional_presenters: str | None = Field(default=None, max_length=500)
    tags: list[str] = Field(default_factory=list)
    links: list[VisitLink] = Field(default_factory=list)

    @field_validator("language")
    @classmethod
    def _clean_language(cls, v: str | None) -> str | None:
        return clean_language(v)

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, v: list[str]) -> list[str]:
        return normalize_tags(v)

    @field_validator("links")
    @classmethod
    def _cap_links(cls, v: list[VisitLink]) -> list[VisitLink]:
        return [x for x in v if x.url][:MAX_LINKS]


class VisitUpdate(BaseModel):
    venue_id: int | None = None
    status: VisitStatus | None = None
    visit_date: date | None = None
    start_time: time | None = None
    event_type: EventType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    contact_name: str | None = Field(default=None, max_length=255)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=50)
    host_role: str | None = Field(default=None, max_length=255)
    host_relationship: HostRelationship | None = None
    host_relationship_detail: str | None = Field(default=None, max_length=500)
    host_notes: str | None = None
    people_reached: int | None = Field(default=None, ge=0, le=MAX_PEOPLE_REACHED)
    audience_level: AudienceLevel | None = None
    language: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    reflection: str | None = None
    follow_up_planned: bool | None = None
    additional_presenters: str | None = Field(default=None, max_length=500)
    tags: list[str] | None = None
    links: list[VisitLink] | None = None

    @field_validator("language")
    @classmethod
    def _clean_language(cls, v: str | None) -> str | None:
        return clean_language(v)

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else normalize_tags(v)

    @field_validator("links")
    @classmethod
    def _cap_links(cls, v: list[VisitLink] | None) -> list[VisitLink] | None:
        return None if v is None else [x for x in v if x.url][:MAX_LINKS]


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author: UserBrief
    venue: VenueBrief
    status: VisitStatus
    visit_date: date
    start_time: time | None
    event_type: EventType
    title: str
    description: str | None
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    host_role: str | None
    host_relationship: HostRelationship | None
    host_relationship_detail: str | None
    host_notes: str | None
    people_reached: int
    audience_level: AudienceLevel
    language: str | None
    duration_minutes: int | None
    rating: int | None
    reflection: str | None
    follow_up_planned: bool
    additional_presenters: str | None
    tags: list[str]
    links: list[VisitLink]
    created_at: datetime
    updated_at: datetime


class VisitList(BaseModel):
    items: list[VisitOut]
    total: int
    page: int
    page_size: int


# --- Stats ---

class StatsSummary(BaseModel):
    total_visits: int
    total_people_reached: int
    distinct_venues: int
    active_communicators: int
    avg_rating: float | None


class TimeseriesPoint(BaseModel):
    period: str
    visits: int
    people_reached: int


class BreakdownRow(BaseModel):
    key: str
    visits: int
    people_reached: int


class TopVenueRow(BaseModel):
    venue: VenueBrief
    visits: int
    people_reached: int


# --- Public impact page (unauthenticated, aggregate-only) ---

class PublicActivity(BaseModel):
    """A report-safe slice of a visit for the public page — factual fields
    only, never notes/ratings/host contact details."""

    visit_date: date
    title: str
    event_type: EventType
    venue_name: str
    venue_city: str | None
    people_reached: int


class PublicImpact(BaseModel):
    site_name: str | None
    total_visits: int
    total_people_reached: int
    distinct_venues: int
    active_communicators: int
    timeseries: list[TimeseriesPoint]
    by_venue_type: list[BreakdownRow]
    recent: list[PublicActivity]


class LeaderboardRow(BaseModel):
    user: UserBrief
    visits: int
    people_reached: int


# --- Map / institutions ---

class InstitutionPoint(BaseModel):
    id: int
    name: str
    institution_type: InstitutionType
    latitude: float
    longitude: float
    city: str | None
    covered: bool
    visit_count: int


class InstitutionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    institution_type: InstitutionType
    latitude: float
    longitude: float
    address: str | None
    city: str | None
    state: str | None
    country: str | None
    website: str | None
    phone: str | None
    region: str | None


class VenuePoint(BaseModel):
    id: int
    name: str
    venue_type: VenueType
    latitude: float
    longitude: float
    city: str | None
    visit_count: int
    visited: bool
    institution_id: int | None
