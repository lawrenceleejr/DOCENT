import enum
from datetime import date, datetime

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
    UniqueConstraint,
    func,
)
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    visits: Mapped[list["Visit"]] = relationship(back_populates="venue")


class Visit(Base):
    __tablename__ = "visits"
    __table_args__ = (
        CheckConstraint("people_reached >= 0", name="ck_people_reached_nonneg"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_rating_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"), index=True)
    visit_date: Mapped[date] = mapped_column(Date, index=True)
    event_type: Mapped[EventType] = mapped_column(Enum(EventType, name="event_type"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    contact_name: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    people_reached: Mapped[int] = mapped_column(Integer)
    audience_level: Mapped[AudienceLevel] = mapped_column(
        Enum(AudienceLevel, name="audience_level")
    )
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    rating: Mapped[int | None] = mapped_column(Integer)
    reflection: Mapped[str | None] = mapped_column(Text)
    follow_up_planned: Mapped[bool] = mapped_column(Boolean, default=False)
    additional_presenters: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    author: Mapped[User] = relationship(back_populates="visits")
    venue: Mapped[Venue] = relationship(back_populates="visits")
