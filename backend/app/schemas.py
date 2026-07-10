from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import AudienceLevel, EventType, VenueType


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


class PasswordResetResult(BaseModel):
    user_id: int
    temporary_password: str


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
    visit_date: date
    event_type: EventType
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    contact_name: str | None = Field(default=None, max_length=255)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=50)
    people_reached: int = Field(ge=0, le=MAX_PEOPLE_REACHED)
    audience_level: AudienceLevel
    duration_minutes: int | None = Field(default=None, ge=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    reflection: str | None = None
    follow_up_planned: bool = False
    additional_presenters: str | None = Field(default=None, max_length=500)


class VisitUpdate(BaseModel):
    venue_id: int | None = None
    visit_date: date | None = None
    event_type: EventType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    contact_name: str | None = Field(default=None, max_length=255)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=50)
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
    visit_date: date
    event_type: EventType
    title: str
    description: str | None
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
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
