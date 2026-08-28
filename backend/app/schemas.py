import re
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

MAX_TAGS = 30
MAX_TAG_LEN = 50
MAX_LINKS = 50

# Kinds of external coverage a visit can link to.
COVERAGE_CATEGORIES = (
    "press",
    "social_media",
    "video",
    "blog",
    # Forward-looking links a communicator attaches before the event happens:
    # the event's website/agenda page, and slides or other materials.
    "website",
    "slides",
    "other",
)


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


def normalize_orcid(value: str | None) -> str | None:
    """Validate an ORCID iD and return it in canonical dashed form, or None if
    blank. Accepts a bare 16-char id, a dashed id, or a full orcid.org URL."""
    if value is None:
        return None
    s = value.strip()
    if not s:
        return None
    for prefix in ("https://orcid.org/", "http://orcid.org/", "orcid.org/"):
        if s.lower().startswith(prefix):
            s = s[len(prefix):]
            break
    compact = s.replace("-", "").upper()
    if not re.fullmatch(r"\d{15}[\dX]", compact):
        raise ValueError("Invalid ORCID iD (expected 0000-0000-0000-0000)")
    return f"{compact[0:4]}-{compact[4:8]}-{compact[8:12]}-{compact[12:16]}"


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
    FederationInterval,
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


def _resolve_audience_levels(
    levels: "list[AudienceLevel] | None",
    primary: "AudienceLevel | None",
    *,
    required: bool,
) -> "list[AudienceLevel] | None":
    """Normalise the audience multi-select (#42): fall back to the single
    `primary` when the list is absent, dedupe order-preserving, and enforce at
    least one when `required`. Returns None only for an omitted optional update."""
    source = levels if levels is not None else ([primary] if primary else None)
    if source is None:
        if required:
            raise ValueError("at least one audience level is required")
        return None
    deduped: list = []
    for lv in source:
        if lv is not None and lv not in deduped:
            deduped.append(lv)
    if not deduped:
        raise ValueError("at least one audience level is required")
    return deduped


# --- Auth / users ---

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    affiliation: str | None = Field(default=None, max_length=255)
    position: str | None = Field(default=None, max_length=255)
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
    map_radius_km: float
    banner_message: str | None
    banner_level: str
    user_directory_visible: bool
    # True when at least one enabled federation peer exists, so the UI can hide
    # the "sibling instances" controls entirely on stand-alone instances (#6).
    has_siblings: bool
    # Cloudflare Web Analytics beacon token (parsed from the admin-pasted
    # snippet), or None when analytics isn't configured. Public so the beacon
    # can load on every page, including the login and public impact pages.
    cf_analytics_token: str | None


class LoginHistoryEntry(BaseModel):
    """One login or account-registration event, for the admin login-history
    view (#30)."""

    id: int
    user_id: int
    user_name: str
    user_email: str
    event_type: Literal["login", "register"]
    created_at: datetime


class LoginHistoryDay(BaseModel):
    """Per-day login/registration totals for the login-history plot (zero-filled)."""

    date: str
    logins: int
    registrations: int
    active_users: int


class LoginHistory(BaseModel):
    total: int
    recent: list[LoginHistoryEntry]
    daily: list[LoginHistoryDay]


class UserRole(BaseModel):
    """One additional role a communicator holds, inside or outside their primary
    institution (#22). The primary position/affiliation stay the headline role."""

    model_config = ConfigDict(from_attributes=True)

    title: str = Field(min_length=1, max_length=120)
    organization: str | None = Field(default=None, max_length=255)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    affiliation: str | None
    position: str | None
    orcid: str | None
    is_admin: bool
    is_active: bool
    languages_spoken: list[str]
    roles: list[UserRole] = []
    created_at: datetime


class UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ContributorUser(BaseModel):
    """A co-presenter resolved to their local account, for the visit form and
    detail view (carries their ORCID so it can render as a link)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    orcid: str | None


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    affiliation: str | None = Field(default=None, max_length=255)
    position: str | None = Field(default=None, max_length=255)
    orcid: str | None = Field(default=None, max_length=64)
    languages_spoken: list[str] | None = None
    roles: list[UserRole] | None = None
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("languages_spoken")
    @classmethod
    def _clean_languages_spoken(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else clean_languages(v)

    @field_validator("roles")
    @classmethod
    def _clean_roles(cls, v: list[UserRole] | None) -> list[UserRole] | None:
        if v is None:
            return None
        cleaned: list[UserRole] = []
        for role in v:
            title = role.title.strip()
            if not title:
                continue  # drop blank rows the editor may submit
            org = (role.organization or "").strip() or None
            cleaned.append(UserRole(title=title, organization=org))
        return cleaned[:25]  # a sane cap; nobody holds 25 roles

    @field_validator("orcid")
    @classmethod
    def _clean_orcid(cls, v: str | None) -> str | None:
        return normalize_orcid(v)


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    email: EmailStr | None = None


class SchoolCreate(BaseModel):
    venue_id: int


class SetupStatus(BaseModel):
    """First-run checklist state for the admin's getting-started card."""

    site_name_set: bool
    access_code_set: bool
    institutions_imported: bool
    first_event_logged: bool


class CalendarFeed(BaseModel):
    """The signed, read-only .ics feed path for the current user."""

    path: str  # e.g. /api/visits/calendar.ics?token=…


class TagCount(BaseModel):
    tag: str
    count: int


class TagRenameRequest(BaseModel):
    """Rename a tag everywhere; renaming onto an existing tag merges them."""

    from_tag: str = Field(min_length=1, max_length=100)
    to_tag: str = Field(min_length=1, max_length=100)


class TagRenameResult(BaseModel):
    events_updated: int
    peers_updated: int


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


class RestoreStatus(BaseModel):
    """Progress of a database restore performed by the backup sidecar (#29)."""

    # idle | queued | running | success | failed
    state: str
    detail: str | None = None
    backup: str | None = None
    at: datetime | None = None


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
    map_radius_km: float
    banner_message: str
    banner_level: str
    user_directory_visible: bool
    # Federation publishing: whether this instance serves its activities feed,
    # whether it also shares planned (upcoming) events, and the full feed URL
    # (incl. token) an admin hands to sibling instances.
    federation_publish: bool
    federation_publish_planned: bool
    federation_feed_url: str
    # The raw Cloudflare Web Analytics snippet, returned verbatim so the admin
    # form round-trips exactly what was pasted.
    cf_analytics_snippet: str


class RegistrationSettingsUpdate(BaseModel):
    invite_code: str | None = None
    contact_email: str | None = None
    site_url: str | None = None
    site_name: str | None = Field(default=None, max_length=120)
    public_page: bool | None = None
    login_message: str | None = Field(default=None, max_length=2000)
    map_center_lat: float | None = Field(default=None, ge=-90, le=90)
    map_center_lon: float | None = Field(default=None, ge=-180, le=180)
    map_radius_km: float | None = Field(default=None, gt=0, le=20000)
    banner_message: str | None = Field(default=None, max_length=2000)
    banner_level: Literal["info", "warning", "critical"] | None = None
    user_directory_visible: bool | None = None
    federation_publish: bool | None = None
    federation_publish_planned: bool | None = None
    cf_analytics_snippet: str | None = Field(default=None, max_length=2000)




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
    url: str | None = Field(default=None, max_length=500)
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
    url: str | None = Field(default=None, max_length=500)
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
    url: str | None
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
    position: str | None
    orcid: str | None
    languages_spoken: list[str]
    roles: list[UserRole] = []
    schools: list[VenueBrief]


class ProfileVisit(BaseModel):
    """A member profile's visit row — factual fields only, never the private
    ones (host contact/notes, reflection, rating)."""

    id: int
    visit_date: date
    status: VisitStatus
    title: str
    event_type: EventType
    audience_level: AudienceLevel | None
    venue_name: str
    venue_city: str | None
    people_reached: int


class UserProfileOut(BaseModel):
    """Another member's viewable profile (#16): public details + their events."""

    id: int
    name: str
    affiliation: str | None
    position: str | None
    orcid: str | None
    languages_spoken: list[str]
    roles: list[UserRole] = []
    schools: list[VenueBrief]
    total_visits: int
    total_people_reached: int
    visits: list[ProfileVisit]


class DirectoryUserList(BaseModel):
    items: list[DirectoryUserOut]
    total: int
    page: int
    page_size: int
    # Distinct values across the whole directory (not just this page), feeding
    # the position / institution filter multiselects.
    positions: list[str] = []
    institutions: list[str] = []


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
    """One address/place autocomplete result — prefills a new venue's address
    fields, and (when the result is a named place) its name, so the communicator
    doesn't have to retype it. It never sets the venue type: a geocoder can't
    reliably tell a middle school from a museum."""

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
# entries (e.g. an extra zero) while still allowing large-scale media reach
# (podcasts, viral video) up to half a billion (#41). Fits a Postgres int.
MAX_PEOPLE_REACHED = 500_000_000


# --- Visits ---

class VisitCreate(BaseModel):
    venue_id: int
    # Whose event this is. Omitted (the normal case) it's the caller's own;
    # naming someone else attributes the event to that communicator and is
    # admin-only — the route enforces it. Exists so an admin can log or import
    # a colleague's back-catalogue on their behalf (e.g. a CV handed over as a
    # CSV), which is the only way an event can land under an account that
    # didn't create it.
    author_id: int | None = None
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
    # An event can target several audience levels (#42). `audience_levels` is the
    # multi-select; `audience_level` is the single primary (first of the list) and
    # is accepted on its own for back-compat. At least one must be given.
    audience_level: AudienceLevel | None = None
    audience_levels: list[AudienceLevel] | None = None
    language: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    reflection: str | None = None
    follow_up_planned: bool = False
    is_broadcast: bool = False
    additional_presenters: str | None = Field(default=None, max_length=500)
    co_presenter_user_ids: list[int] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    links: list[VisitLink] = Field(default_factory=list)

    @model_validator(mode="after")
    def _resolve_audiences(self) -> "VisitCreate":
        self.audience_levels = _resolve_audience_levels(
            self.audience_levels, self.audience_level, required=True
        )
        self.audience_level = self.audience_levels[0]
        return self

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
    audience_levels: list[AudienceLevel] | None = None
    language: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    reflection: str | None = None
    follow_up_planned: bool | None = None
    is_broadcast: bool | None = None
    additional_presenters: str | None = Field(default=None, max_length=500)
    co_presenter_user_ids: list[int] | None = None
    tags: list[str] | None = None
    links: list[VisitLink] | None = None

    @model_validator(mode="after")
    def _dedupe_audiences(self) -> "VisitUpdate":
        # Only normalise when the client actually sent an audience field; the
        # router keeps the scalar primary in step with the list (#42).
        if self.audience_levels is not None or self.audience_level is not None:
            self.audience_levels = _resolve_audience_levels(
                self.audience_levels, self.audience_level, required=False
            )
        return self

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
    audience_levels: list[AudienceLevel]
    language: str | None
    duration_minutes: int | None
    rating: int | None
    reflection: str | None
    follow_up_planned: bool
    is_broadcast: bool
    additional_presenters: str | None
    co_presenters: list[ContributorUser] = Field(default_factory=list)
    tags: list[str]
    links: list[VisitLink]
    created_at: datetime
    updated_at: datetime


class ActivityListItem(BaseModel):
    """A visit-list row that can be either a local visit or an activity pulled
    from a sibling instance. Local rows fill every field; federated rows carry
    only feed-safe fields (the rest are None / rendered as "—") plus an
    `external_url` deep-link back to the primary instance. `venue`/`author` are
    kept nested (matching the local visit shape) — for federated rows they are
    synthetic (id 0, only name/city/type populated)."""

    source: str  # "local" | the peer's label
    id: int | None  # local visit id (None for federated)
    external_url: str | None  # federated permalink (None for local)
    visit_date: date
    start_time: time | None = None
    status: VisitStatus | None = None
    title: str | None = None
    event_type: EventType | None = None
    audience_level: AudienceLevel | None = None
    language: str | None = None
    people_reached: int
    rating: int | None = None
    tags: list[str] = []
    author: UserBrief | None = None
    venue: VenueBrief | None = None


class VisitList(BaseModel):
    items: list[ActivityListItem]
    total: int
    page: int
    page_size: int


class ActivitySource(BaseModel):
    """A selectable source for the list/map source filter: the local instance or
    one enabled peer. `value` is "local" or the peer id as a string."""
    value: str
    label: str


# --- Stats ---

class StatsSummary(BaseModel):
    total_visits: int
    total_people_reached: int
    # Of total_people_reached, the share from remote/broadcast events (#38).
    total_people_reached_remote: int = 0
    distinct_venues: int
    active_communicators: int
    avg_rating: float | None


class TimeseriesPoint(BaseModel):
    period: str
    visits: int
    people_reached: int
    # Of people_reached in this bucket, the remote/broadcast share (#38); the
    # in-person share is people_reached - people_reached_remote.
    people_reached_remote: int = 0
    # Scheduled (not-yet-completed) visits in this bucket — drawn as a separate
    # dotted series in the analysis plots (#28).
    planned_visits: int = 0


class BreakdownRow(BaseModel):
    key: str
    visits: int
    people_reached: int
    people_reached_remote: int = 0


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
    # Whether this instance pulls from any sibling community, so the public page
    # only shows the sibling toggle when it does (#25).
    has_siblings: bool = False
    total_visits: int
    total_people_reached: int
    total_people_reached_remote: int = 0
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


# --- Federation ---

class Contributor(BaseModel):
    """A person involved in an activity — the lead or a co-presenter — with
    their ORCID where known, so a receiving community can link people (#9)."""

    name: str
    orcid: str | None = None


class FederatedActivityOut(BaseModel):
    """A single limited-field activity in the feed this instance publishes to
    siblings. Never carries private fields (description, reflection, rating,
    host contact details, notes)."""

    uid: str  # globally-unique, stable dedup key
    remote_id: int  # this instance's own visit id (used to build the permalink)
    status: str  # "completed" | "planned"
    visit_date: date
    venue_name: str | None
    venue_city: str | None
    latitude: float | None
    longitude: float | None
    venue_type: str | None  # raw enum value
    event_type: str | None  # raw enum value
    audience_level: str | None  # raw enum value
    person_name: str | None
    # Lead + co-presenters with ORCIDs where known (person_name stays for
    # backward compatibility with older consumers).
    contributors: list[Contributor] = Field(default_factory=list)
    # The activity's tags, so subscribers can pull in only a tagged subset (#31).
    tags: list[str] = Field(default_factory=list)
    people_reached: int
    # Whether this activity is remote/broadcast reach (#38). Feed v4+; absent
    # from older peers, where the consumer defaults it to false (in-person).
    is_broadcast: bool = False
    permalink: str | None


class FederationFeed(BaseModel):
    """Envelope for the published feed — instance identity + activities."""

    feed_version: int
    instance_name: str | None
    instance_url: str | None
    generated_at: datetime
    activities: list[FederatedActivityOut]


class FederationPeerOut(BaseModel):
    """Admin view of a registered sibling. `feed_url` has its token masked."""

    id: int
    label: str | None
    feed_url: str  # token masked for display
    interval: FederationInterval
    enabled: bool
    last_synced_at: datetime | None
    next_sync_at: datetime | None
    last_status: str | None
    last_error: str | None
    consecutive_failures: int
    activity_count: int
    tag_filter: list[str] = []
    created_at: datetime


class FederationPeerPreview(BaseModel):
    """Result of a "test this URL" probe before adding a peer."""

    ok: bool
    instance_name: str | None = None
    instance_url: str | None = None
    activity_count: int | None = None
    error: str | None = None


class FederationPeerCreate(BaseModel):
    feed_url: str = Field(min_length=1, max_length=2000)
    interval: FederationInterval = FederationInterval.day
    # Only pull this sibling's events whose tags overlap this list (#31);
    # empty pulls everything.
    tag_filter: list[str] = []

    @field_validator("tag_filter")
    @classmethod
    def _clean_tag_filter(cls, v: list[str]) -> list[str]:
        return normalize_tags(v)


class FederationPeerUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=255)
    interval: FederationInterval | None = None
    enabled: bool | None = None
    tag_filter: list[str] | None = None

    @field_validator("tag_filter")
    @classmethod
    def _clean_tag_filter(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else normalize_tags(v)


class FederatedMapPoint(BaseModel):
    """A sibling activity rendered as its own map layer (never affects local
    coverage/gap counting)."""

    latitude: float
    longitude: float
    venue_name: str | None
    venue_type: str | None
    person_name: str | None
    visit_date: date
    people_reached: int
    permalink: str | None
    source_label: str | None


# --- CSV event import (own-profile bulk import wizard) ---

class ImportDraftRow(BaseModel):
    """One CSV row mapped to a best-effort draft event. Every field is optional
    and freely editable in the wizard — the raw row is kept so the communicator
    can see anything that wasn't mapped."""

    index: int
    raw: dict[str, str]
    title: str | None = None
    visit_date: str | None = None  # ISO yyyy-mm-dd when parseable, else None
    date_raw: str | None = None
    event_type: str | None = None
    audience_level: str | None = None
    people_reached: int | None = None
    venue_name: str | None = None
    venue_city: str | None = None
    description: str | None = None
    start_time: str | None = None
    duration_minutes: int | None = None
    language: str | None = None
    presenters: str | None = None
    url: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ImportParseResponse(BaseModel):
    format: Literal["symplectic", "generic"]
    columns: list[str]
    mappable_fields: list[str]
    suggested_mapping: dict[str, str]
    rows: list[ImportDraftRow]
