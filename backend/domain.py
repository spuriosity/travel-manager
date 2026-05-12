from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable


DEFAULT_CHECKIN_HOUR = 15
DEFAULT_CHECKOUT_HOUR = 11
SLEEP_MARKER_HOUR = 21


@dataclass(frozen=True)
class BookingLike:
    id: int
    hotel_name: str
    city: str
    arrival_date: date
    departure_date: date
    checkin_time: str
    checkout_time: str
    cancellation_policy: str
    cancellable_until: date | None


def date_range(start: date, end: date) -> list[date]:
    if end < start:
        return []
    days = (end - start).days
    return [start + timedelta(days=offset) for offset in range(days + 1)]


def sleep_nights(arrival: date, departure: date) -> list[date]:
    if departure <= arrival:
        return []
    return date_range(arrival, departure - timedelta(days=1))


def hour_fraction(value: str, fallback_hour: int) -> float:
    try:
        hour_text, minute_text = value.split(":", 1)
        hour = int(hour_text)
        minute = int(minute_text)
    except (TypeError, ValueError):
        hour = fallback_hour
        minute = 0
    return (hour + minute / 60) / 24


def timeline_segment(booking: BookingLike, trip_start: date) -> dict:
    start_offset = (booking.arrival_date - trip_start).days + hour_fraction(
        booking.checkin_time, DEFAULT_CHECKIN_HOUR
    )
    end_offset = (booking.departure_date - trip_start).days + hour_fraction(
        booking.checkout_time, DEFAULT_CHECKOUT_HOUR
    )
    return {
        "booking_id": booking.id,
        "start_offset": start_offset,
        "end_offset": max(end_offset, start_offset + 0.08),
        "sleep_markers": [
            {
                "date": night.isoformat(),
                "offset": (night - trip_start).days + SLEEP_MARKER_HOUR / 24,
                "label": f"{booking.hotel_name}, {booking.city}",
            }
            for night in sleep_nights(booking.arrival_date, booking.departure_date)
        ],
    }


def future_cancellation_label(booking: BookingLike, today: date) -> str | None:
    if booking.cancellation_policy != "free_cancellation_until":
        return None
    if booking.cancellable_until is None or booking.cancellable_until < today:
        return None
    return f"Cancel before {booking.cancellable_until.strftime('%-d %b')}"


def bag_gaps(bookings: Iterable[BookingLike], trip_start: date) -> list[dict]:
    ordered = sorted(bookings, key=lambda booking: (booking.arrival_date, booking.departure_date))
    gaps: list[dict] = []
    for previous, current in zip(ordered, ordered[1:]):
        if previous.departure_date != current.arrival_date:
            continue
        checkout = hour_fraction(previous.checkout_time, DEFAULT_CHECKOUT_HOUR)
        checkin = hour_fraction(current.checkin_time, DEFAULT_CHECKIN_HOUR)
        if checkin <= checkout:
            continue
        day_offset = (current.arrival_date - trip_start).days
        gaps.append(
            {
                "date": current.arrival_date.isoformat(),
                "start_offset": day_offset + checkout,
                "end_offset": day_offset + checkin,
                "label": "Bag gap",
            }
        )
    return gaps
