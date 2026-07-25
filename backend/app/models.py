import enum
import uuid
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


class FederationInterval(str, enum.Enum):
    """How often to pull activities from a sibling DOCENT instance."""

    hour = "hour"
    day = "day"
    week = "week"


class HostRelationship(str, enum.Enum):
    teacher_faculty = "teacher_faculty"
    administrator = "administrator"
    counselor = "counselor"
    alumnus = "alumnus"
    former_student = "former_student"
    # The mirror image of former_student: this person used to teach *me*
    # (e.g. a communicator's own grade-school teacher), not their current
    # job title — that's teacher_faculty or the free-text role field.
    former_teacher = "former_teacher"
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
    position: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Languages this communicator can present in — validated against
    # app.languages.LANGUAGE_SET, same central list as Visit.language.
    languages_spoken: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    visits: Mapped[list["Visit"]] = relationship(back_populates="author")
    schools: Mapped[list["UserSchool"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


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
    # Globally-unique, stable identifier used as the federation dedup key so a
    # peer resetting/re-importing its DB (which reuses integer ids) can't collide
    # with cached rows on subscribers.
    uid: Mapped[str] = mapped_column(
        String(36), unique=True, index=True, default=lambda: str(uuid.uuid4())
    )
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
    # Free-ish text, but constrained to app.languages.LANGUAGE_SET at the
    # Pydantic layer — plain String rather than a Postgres enum so the central
    # list can grow without an ALTER TYPE migration.
    language: Mapped[str | None] = mapped_column(String(50))
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


class Connection(Base):
    """A person our organization has contact with at a venue — a past visit
    host, or someone a communicator knows personally (a teacher, an alum, a
    family friend) even if no visit has ever been logged there. Distinct from
    a Visit's host_* fields, which record who hosted that specific visit;
    a Connection is a standing relationship a communicator maintains."""

    __tablename__ = "connections"
    __table_args__ = (
        UniqueConstraint("venue_id", "name", name="uq_connection_venue_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    venue_id: Mapped[int] = mapped_column(
        ForeignKey("venues.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(255))
    relationship_type: Mapped[HostRelationship | None] = mapped_column(
        Enum(HostRelationship, name="host_relationship")
    )
    relationship_detail: Mapped[str | None] = mapped_column(String(500))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
    added_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    added_by: Mapped[User | None] = relationship()


class UserSchool(Base):
    """A school/institution a communicator personally attended — self-reported
    on their profile. Adding one also creates (or links) a standing Connection
    at that venue (relationship_type=alumnus) so the alumni tie shows up in the
    venue's own contact list, same as any other Connection."""

    __tablename__ = "user_schools"
    __table_args__ = (UniqueConstraint("user_id", "venue_id", name="uq_user_school"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    venue_id: Mapped[int] = mapped_column(
        ForeignKey("venues.id", ondelete="CASCADE"), index=True
    )
    connection_id: Mapped[int | None] = mapped_column(
        ForeignKey("connections.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="schools")
    venue: Mapped[Venue] = relationship()
    connection: Mapped[Connection | None] = relationship()


class Setting(Base):
    """Runtime key/value settings an admin can change without a redeploy
    (e.g. the registration access code and the contact email)."""

    __tablename__ = "app_setting"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class FederationPeer(Base):
    """A sibling DOCENT instance whose activities this instance pulls in.

    `feed_url` is the full URL an admin pasted, INCLUDING the sibling's
    federation token (e.g. https://sib.edu/api/federation/activities?token=...).
    """

    __tablename__ = "federation_peers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str | None] = mapped_column(String(255))
    feed_url: Mapped[str] = mapped_column(Text)
    interval: Mapped[FederationInterval] = mapped_column(
        Enum(FederationInterval, name="federation_interval"),
        server_default=FederationInterval.day.value,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str | None] = mapped_column(String(16))  # "ok" | "error"
    last_error: Mapped[str | None] = mapped_column(Text)
    activity_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    # Sync bookkeeping: consecutive_failures drives exponential backoff;
    # last_updated_at is the incremental high-water mark; last_full_synced_at
    # gates the periodic full reconcile that catches remote deletions.
    consecutive_failures: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    last_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_full_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    activities: Mapped[list["FederatedActivity"]] = relationship(
        back_populates="peer", cascade="all, delete-orphan"
    )


class FederatedActivity(Base):
    """A locally-cached, limited-field copy of an activity pulled from a peer.

    Deliberately narrow: date, place (+coords/type), the person, event type,
    people reached, and a deep-link back to the peer. NO private fields
    (descriptions, reflections, ratings, host contact details, notes)."""

    __tablename__ = "federated_activities"
    __table_args__ = (
        UniqueConstraint("peer_id", "remote_uid", name="uq_federated_peer_uid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    peer_id: Mapped[int] = mapped_column(
        ForeignKey("federation_peers.id", ondelete="CASCADE"), index=True
    )
    remote_uid: Mapped[str] = mapped_column(String(36))  # the source visit's uid (dedup key)
    remote_id: Mapped[int] = mapped_column(Integer)  # the source visit's id (for the permalink)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="completed"
    )  # "completed" | "planned"
    visit_date: Mapped[date] = mapped_column(Date, index=True)
    venue_name: Mapped[str | None] = mapped_column(String(255))
    venue_city: Mapped[str | None] = mapped_column(String(255))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    venue_type: Mapped[str | None] = mapped_column(String(50))  # raw enum value
    event_type: Mapped[str | None] = mapped_column(String(50))  # raw enum value
    audience_level: Mapped[str | None] = mapped_column(String(50))  # raw enum value
    person_name: Mapped[str | None] = mapped_column(String(255))
    people_reached: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    permalink: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    peer: Mapped[FederationPeer] = relationship(back_populates="activities")
