from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class TimelineBooking(Base):
    __tablename__ = "timeline_bookings"
    __table_args__ = (UniqueConstraint("timeline_id", "booking_id"),)

    timeline_id: Mapped[int] = mapped_column(ForeignKey("timelines.id", ondelete="CASCADE"), primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), primary_key=True)


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    trip_url: Mapped[str] = mapped_column(String(1000), default="")

    bookings: Mapped[list[Booking]] = relationship(back_populates="trip", cascade="all, delete-orphan")
    timelines: Mapped[list[Timeline]] = relationship(back_populates="trip", cascade="all, delete-orphan")
    travel_events: Mapped[list[TravelEvent]] = relationship(back_populates="trip", cascade="all, delete-orphan")


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    hotel_name: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(120))
    arrival_date: Mapped[date] = mapped_column(Date)
    departure_date: Mapped[date] = mapped_column(Date)
    checkin_time: Mapped[str] = mapped_column(String(5), default="15:00")
    checkout_time: Mapped[str] = mapped_column(String(5), default="11:00")
    cancellation_policy: Mapped[str] = mapped_column(String(40), default="unknown")
    cancellable_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    price_eur: Mapped[float] = mapped_column(default=0.0)
    notes: Mapped[str] = mapped_column(String(1000), default="")
    booking_url: Mapped[str] = mapped_column(String(1000), default="")

    trip: Mapped[Trip] = relationship(back_populates="bookings")
    timelines: Mapped[list[Timeline]] = relationship(secondary="timeline_bookings", back_populates="bookings")


class Timeline(Base):
    __tablename__ = "timelines"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    color: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(20), default="candidate")
    order_index: Mapped[int] = mapped_column(default=0)

    trip: Mapped[Trip] = relationship(back_populates="timelines")
    bookings: Mapped[list[Booking]] = relationship(secondary="timeline_bookings", back_populates="timelines")


class TravelEvent(Base):
    __tablename__ = "travel_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    travel_date: Mapped[date] = mapped_column(Date)
    mode: Mapped[str] = mapped_column(String(20))
    label: Mapped[str] = mapped_column(String(200), default="")

    trip: Mapped[Trip] = relationship(back_populates="travel_events")
