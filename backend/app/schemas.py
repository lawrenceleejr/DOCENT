from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (
    AudienceLevel,
    EventType,
    HostRelationship,
    InstitutionType,
    VenueType,
    VisitStatus,
)


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


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    affiliation: str | None
    is_admin: bool
    is_active: bool
    created_at: datetime


class UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    affiliation: str | None = Field(default=None, max_length=255)
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    email: EmailStr | None = None


class UserList(BaseModel):
    items: list[UserOut]
    total: int
    page: int
    page_size: int


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


class RegistrationSettings(BaseModel):
    invite_code: str
    contact_email: str


class RegistrationSettingsUpdate(BaseModel):
    invite_code: str | None = None
    contact_email: str | None = None


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
    duration_minutes: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    reflection: str | None = None
    follow_up_planned: bool = False
    additional_presenters: str | None = Field(default=None, max_length=500)


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
    duration_minutes: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    reflection: str | None = None
    follow_up_planned: bool | None = None
    additional_presenters: str | None = Field(default=None, max_length=500)


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
    duration_minutes: int | None
    rating: int | None
    reflection: str | None
    follow_up_planned: bool
    additional_presenters: str | None
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
    active_researchers: int
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
    institution_id: int | None
