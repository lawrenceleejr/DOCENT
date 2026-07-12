import enum
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VenueType(str, enum.Enum):
    elementary_school = "elementary_school"
    middle_school = "middle_school"
    high_school = "high_school"
    community_college = "community_college"
    university = "university"
    museum = "museum"
    library = "library"
    community_center = "community_center"
    other = "other"


class EventType(str, enum.Enum):
    classroom_visit = "classroom_visit"
    science_fair = "science_fair"
    public_lecture = "public_lecture"
    lab_tour = "lab_tour"
    career_day = "career_day"
    demo_booth = "demo_booth"
    workshop = "workshop"
    other = "other"


class AudienceLevel(str, enum.Enum):
    elementary = "elementary"
    middle_school = "middle_school"
    high_school = "high_school"
    community_college = "community_college"
    undergraduate = "undergraduate"
    graduate = "graduate"
    general_public = "general_public"
    educators = "educators"
    mixed = "mixed"


class InstitutionType(str, enum.Enum):
    school = "school"
    college = "college"
    university = "university"
    museum = "museum"
    library = "library"
    other = "other"


class VisitStatus(str, enum.Enum):
    planned = "planned"
    completed = "completed"


class HostRelationship(str, enum.Enum):
    teacher_faculty = "teacher_faculty"
    administrator = "administrator"
    counselor = "counselor"
    alumnus = "alumnus"
    former_student = "former_student"
    collaborator = "collaborator"
    community_partner = "community_partner"
    family_friend = "family_friend"
    cold_outreach = "cold_outreach"
    other = "other"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    affiliation: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    visits: Mapped[list["Visit"]] = relationship(back_populates="author")


class Venue(Base):
    __tablename__ = "venues"
    __table_args__ = (UniqueConstraint("name", "city", name="uq_venue_name_city"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    venue_type: Mapped[VenueType] = mapped_column(Enum(VenueType, name="venue_type"))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120), index=True)
    state: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str] = mapped_column(String(120), default="USA")
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    # Optional link to a catalog institution (set when created from the map/catalog).
    institution_id: Mapped[int | None] = mapped_column(
        ForeignKey("institutions.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    visits: Mapped[list["Visit"]] = relationship(back_populates="venue")
    institution: Mapped["Institution | None"] = relationship(back_populates="venues")


class Institution(Base):
    """Reference catalog of educational institutions (imported from OpenStreetMap).

    These are potential outreach targets. A venue that has been visited can link
    to one via Venue.institution_id; institutions with no visited venue are the
    coverage "gaps" shown on the map.
    """

    __tablename__ = "institutions"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_institution_source_extid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(50), default="osm")
    external_id: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(255), index=True)
    institution_type: Mapped[InstitutionType] = mapped_column(
        Enum(InstitutionType, name="institution_type")
    )
    latitude: Mapped[float] = mapped_column(Float, index=True)
    longitude: Mapped[float] = mapped_column(Float, index=True)
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120), index=True)
    state: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(120))
    website: Mapped[str | None] = mapped_column(String(500))
    phone: Mapped[str | None] = mapped_column(String(50))
    region: Mapped[str | None] = mapped_column(String(120), index=True)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    venues: Mapped[list["Venue"]] = relationship(back_populates="institution")


class Visit(Base):
    __tablename__ = "visits"
    __table_args__ = (
        CheckConstraint("people_reached >= 0", name="ck_people_reached_nonneg"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_rating_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    # planned = a scheduled future event; completed = an outreach that happened.
    # Only completed visits count toward stats and map coverage.
    status: Mapped[VisitStatus] = mapped_column(
        Enum(VisitStatus, name="visit_status"),
        server_default=VisitStatus.completed.value,
        index=True,
    )
    visit_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time | None] = mapped_column(Time)
    event_type: Mapped[EventType] = mapped_column(Enum(EventType, name="event_type"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    # Host: the person who hosted/invited the visit at the venue. The
    # contact_* columns hold the host's contact details (kept from the original
    # "venue contact" fields so existing data is preserved).
    contact_name: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    host_role: Mapped[str | None] = mapped_column(String(255))
    host_relationship: Mapped[HostRelationship | None] = mapped_column(
        Enum(HostRelationship, name="host_relationship")
    )
    host_relationship_detail: Mapped[str | None] = mapped_column(String(500))
    host_notes: Mapped[str | None] = mapped_column(Text)
    people_reached: Mapped[int] = mapped_column(Integer)
    audience_level: Mapped[AudienceLevel] = mapped_column(
        Enum(AudienceLevel, name="audience_level")
    )
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    rating: Mapped[int | None] = mapped_column(Integer)
    reflection: Mapped[str | None] = mapped_column(Text)
    follow_up_planned: Mapped[bool] = mapped_column(Boolean, default=False)
    additional_presenters: Mapped[str | None] = mapped_column(String(500))
    # Free-text labels for grouping/filtering (e.g. "nsf-career", "girls-in-stem").
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'")
    )
    # Coverage links: list of {url, category, label} recording press, social
    # media, video, blog, or other coverage of the event.
    links: Mapped[list[dict]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    author: Mapped[User] = relationship(back_populates="visits")
    venue: Mapped[Venue] = relationship(back_populates="visits")


class Setting(Base):
    """Runtime key/value settings an admin can change without a redeploy
    (e.g. the registration access code and the contact email)."""

    __tablename__ = "app_setting"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
