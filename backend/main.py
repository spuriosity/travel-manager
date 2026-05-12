from __future__ import annotations

from datetime import date

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.database import get_session, init_db
from backend.domain import bag_gaps, date_range, future_cancellation_label, timeline_segment
from backend.models import Booking, Timeline, TimelineBooking, TravelEvent, Trip
from backend.schemas import (
    BookingCreate,
    BookingRead,
    BookingUpdate,
    TimelineCreate,
    TimelineRead,
    TimelineReorder,
    TimelineUpdate,
    TravelEventCreate,
    TravelEventRead,
    TripCreate,
    TripRead,
)


PALETTE = ["#9bc6ff", "#b8e0c3", "#f6c6d6", "#f9d99a", "#cdb7f6", "#a7ded9", "#ffc4a3"]

app = FastAPI(title="Travel Manager")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


def booking_read(booking: Booking) -> BookingRead:
    return BookingRead(
        id=booking.id,
        trip_id=booking.trip_id,
        hotel_name=booking.hotel_name,
        city=booking.city,
        arrival_date=booking.arrival_date,
        departure_date=booking.departure_date,
        checkin_time=booking.checkin_time,
        checkout_time=booking.checkout_time,
        cancellation_policy=booking.cancellation_policy,
        cancellable_until=booking.cancellable_until,
        price_eur=booking.price_eur,
        notes=booking.notes,
        booking_url=booking.booking_url,
        timeline_ids=[timeline.id for timeline in booking.timelines],
    )


def ensure_trip(session: Session, trip_id: int) -> Trip:
    trip = session.get(Trip, trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def ensure_booking(session: Session, trip_id: int, booking_id: int) -> Booking:
    booking = session.scalar(
        select(Booking)
        .where(Booking.id == booking_id, Booking.trip_id == trip_id)
        .options(selectinload(Booking.timelines))
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def ensure_timeline(session: Session, trip_id: int, timeline_id: int) -> Timeline:
    timeline = session.scalar(select(Timeline).where(Timeline.id == timeline_id, Timeline.trip_id == trip_id))
    if timeline is None:
        raise HTTPException(status_code=404, detail="Timeline not found")
    return timeline


def ensure_travel_event(session: Session, trip_id: int, travel_event_id: int) -> TravelEvent:
    travel_event = session.scalar(select(TravelEvent).where(TravelEvent.id == travel_event_id, TravelEvent.trip_id == trip_id))
    if travel_event is None:
        raise HTTPException(status_code=404, detail="Travel event not found")
    return travel_event


@app.get("/api/trips", response_model=list[TripRead])
def list_trips(session: Session = Depends(get_session)) -> list[Trip]:
    return list(session.scalars(select(Trip).order_by(Trip.start_date.desc(), Trip.id.desc())))


@app.post("/api/trips", response_model=TripRead)
def create_trip(payload: TripCreate, session: Session = Depends(get_session)) -> Trip:
    trip = Trip(name=payload.name, start_date=payload.start_date, end_date=payload.end_date, trip_url=payload.trip_url)
    session.add(trip)
    session.flush()
    session.add(Timeline(trip_id=trip.id, name="Confirmed", color="#7bbf9a", kind="confirmed", order_index=0))
    return trip


@app.get("/api/trips/{trip_id}", response_model=TripRead)
def read_trip(trip_id: int, session: Session = Depends(get_session)) -> Trip:
    return ensure_trip(session, trip_id)


@app.put("/api/trips/{trip_id}", response_model=TripRead)
def update_trip(trip_id: int, payload: TripCreate, session: Session = Depends(get_session)) -> Trip:
    trip = ensure_trip(session, trip_id)
    trip.name = payload.name
    trip.start_date = payload.start_date
    trip.end_date = payload.end_date
    trip.trip_url = payload.trip_url
    session.flush()
    return trip


@app.get("/api/trips/{trip_id}/bookings", response_model=list[BookingRead])
def list_bookings(trip_id: int, session: Session = Depends(get_session)) -> list[BookingRead]:
    ensure_trip(session, trip_id)
    bookings = session.scalars(
        select(Booking)
        .where(Booking.trip_id == trip_id)
        .options(selectinload(Booking.timelines))
        .order_by(Booking.arrival_date, Booking.hotel_name)
    )
    return [booking_read(booking) for booking in bookings]


@app.post("/api/trips/{trip_id}/bookings", response_model=BookingRead)
def create_booking(trip_id: int, payload: BookingCreate, session: Session = Depends(get_session)) -> BookingRead:
    ensure_trip(session, trip_id)
    booking = Booking(trip_id=trip_id, **payload.model_dump())
    session.add(booking)
    session.flush()
    session.refresh(booking, ["timelines"])
    return booking_read(booking)


@app.put("/api/trips/{trip_id}/bookings/{booking_id}", response_model=BookingRead)
def update_booking(
    trip_id: int, booking_id: int, payload: BookingUpdate, session: Session = Depends(get_session)
) -> BookingRead:
    booking = ensure_booking(session, trip_id, booking_id)
    for key, value in payload.model_dump().items():
        setattr(booking, key, value)
    session.flush()
    return booking_read(booking)


@app.delete("/api/trips/{trip_id}/bookings/{booking_id}")
def delete_booking(trip_id: int, booking_id: int, session: Session = Depends(get_session)) -> dict:
    booking = ensure_booking(session, trip_id, booking_id)
    session.delete(booking)
    return {"ok": True}


@app.get("/api/trips/{trip_id}/travel-events", response_model=list[TravelEventRead])
def list_travel_events(trip_id: int, session: Session = Depends(get_session)) -> list[TravelEventRead]:
    trip = ensure_trip(session, trip_id)
    events = session.scalars(select(TravelEvent).where(TravelEvent.trip_id == trip_id).order_by(TravelEvent.travel_date, TravelEvent.id))
    return [
        TravelEventRead(
            id=event.id,
            trip_id=event.trip_id,
            travel_date=event.travel_date,
            mode=event.mode,
            label=event.label,
            offset=(event.travel_date - trip.start_date).days + 0.5,
        )
        for event in events
    ]


@app.post("/api/trips/{trip_id}/travel-events", response_model=TravelEventRead)
def create_travel_event(trip_id: int, payload: TravelEventCreate, session: Session = Depends(get_session)) -> TravelEventRead:
    trip = ensure_trip(session, trip_id)
    if payload.mode not in {"plane", "train", "car", "boat", "bicycle"}:
        raise HTTPException(status_code=400, detail="Unsupported travel mode")
    event = TravelEvent(trip_id=trip_id, **payload.model_dump())
    session.add(event)
    session.flush()
    return TravelEventRead(
        id=event.id,
        trip_id=event.trip_id,
        travel_date=event.travel_date,
        mode=event.mode,
        label=event.label,
        offset=(event.travel_date - trip.start_date).days + 0.5,
    )


@app.delete("/api/trips/{trip_id}/travel-events/{travel_event_id}")
def delete_travel_event(trip_id: int, travel_event_id: int, session: Session = Depends(get_session)) -> dict:
    event = ensure_travel_event(session, trip_id, travel_event_id)
    session.delete(event)
    return {"ok": True}


@app.post("/api/trips/{trip_id}/bookings/{booking_id}/duplicate", response_model=BookingRead)
def duplicate_booking(trip_id: int, booking_id: int, session: Session = Depends(get_session)) -> BookingRead:
    booking = ensure_booking(session, trip_id, booking_id)
    duplicate = Booking(
        trip_id=trip_id,
        hotel_name=f"{booking.hotel_name} copy",
        city=booking.city,
        arrival_date=booking.arrival_date,
        departure_date=booking.departure_date,
        checkin_time=booking.checkin_time,
        checkout_time=booking.checkout_time,
        cancellation_policy=booking.cancellation_policy,
        cancellable_until=booking.cancellable_until,
        price_eur=booking.price_eur,
        notes=booking.notes,
        booking_url=booking.booking_url,
    )
    session.add(duplicate)
    session.flush()
    session.refresh(duplicate, ["timelines"])
    return booking_read(duplicate)


@app.get("/api/trips/{trip_id}/timelines", response_model=list[TimelineRead])
def list_timelines(trip_id: int, session: Session = Depends(get_session)) -> list[Timeline]:
    ensure_trip(session, trip_id)
    return list(session.scalars(select(Timeline).where(Timeline.trip_id == trip_id).order_by(Timeline.order_index, Timeline.id)))


@app.post("/api/trips/{trip_id}/timelines", response_model=TimelineRead)
def create_timeline(trip_id: int, payload: TimelineCreate, session: Session = Depends(get_session)) -> Timeline:
    ensure_trip(session, trip_id)
    max_order = session.scalar(select(Timeline.order_index).where(Timeline.trip_id == trip_id).order_by(Timeline.order_index.desc()))
    timeline = Timeline(
        trip_id=trip_id,
        name=payload.name,
        color=payload.color or PALETTE[0],
        kind="candidate",
        order_index=(max_order or 0) + 1,
    )
    session.add(timeline)
    session.flush()
    return timeline


@app.delete("/api/trips/{trip_id}/timelines/{timeline_id}")
def delete_timeline(trip_id: int, timeline_id: int, session: Session = Depends(get_session)) -> dict:
    timeline = ensure_timeline(session, trip_id, timeline_id)
    if timeline.kind == "confirmed":
        raise HTTPException(status_code=400, detail="Confirmed timeline cannot be deleted")
    session.delete(timeline)
    return {"ok": True}


@app.put("/api/trips/{trip_id}/timelines/{timeline_id}", response_model=TimelineRead)
def update_timeline(trip_id: int, timeline_id: int, payload: TimelineUpdate, session: Session = Depends(get_session)) -> Timeline:
    timeline = ensure_timeline(session, trip_id, timeline_id)
    if timeline.kind == "unsorted":
        raise HTTPException(status_code=400, detail="Unsorted lane cannot be renamed")
    timeline.name = payload.name
    session.flush()
    return timeline


@app.put("/api/trips/{trip_id}/timelines/{timeline_id}/reorder", response_model=list[TimelineRead])
def reorder_timeline(
    trip_id: int, timeline_id: int, payload: TimelineReorder, session: Session = Depends(get_session)
) -> list[Timeline]:
    dragged = ensure_timeline(session, trip_id, timeline_id)
    if dragged.kind in {"confirmed", "unsorted"}:
        raise HTTPException(status_code=400, detail="This lane cannot be reordered")

    timelines = list(
        session.scalars(
            select(Timeline)
            .where(Timeline.trip_id == trip_id, Timeline.kind == "candidate")
            .order_by(Timeline.order_index, Timeline.id)
        )
    )
    ordered = [timeline for timeline in timelines if timeline.id != dragged.id]

    insert_at = len(ordered)
    if payload.before_timeline_id is not None:
        before_index = next((index for index, timeline in enumerate(ordered) if timeline.id == payload.before_timeline_id), None)
        if before_index is not None:
            insert_at = before_index
    elif payload.after_timeline_id is not None:
        after_index = next((index for index, timeline in enumerate(ordered) if timeline.id == payload.after_timeline_id), None)
        if after_index is not None:
            insert_at = after_index + 1

    ordered.insert(insert_at, dragged)
    for index, timeline in enumerate(ordered, start=1):
        timeline.order_index = index
    session.flush()
    return ordered


@app.post("/api/trips/{trip_id}/timelines/{timeline_id}/bookings/{booking_id}")
def add_booking_to_timeline(trip_id: int, timeline_id: int, booking_id: int, session: Session = Depends(get_session)) -> dict:
    ensure_timeline(session, trip_id, timeline_id)
    ensure_booking(session, trip_id, booking_id)
    existing = session.get(TimelineBooking, {"timeline_id": timeline_id, "booking_id": booking_id})
    if existing is None:
        session.add(TimelineBooking(timeline_id=timeline_id, booking_id=booking_id))
    return {"ok": True}


@app.delete("/api/trips/{trip_id}/timelines/{timeline_id}/bookings/{booking_id}")
def remove_booking_from_timeline(
    trip_id: int, timeline_id: int, booking_id: int, session: Session = Depends(get_session)
) -> dict:
    ensure_timeline(session, trip_id, timeline_id)
    ensure_booking(session, trip_id, booking_id)
    existing = session.get(TimelineBooking, {"timeline_id": timeline_id, "booking_id": booking_id})
    if existing is not None:
        session.delete(existing)
    return {"ok": True}


@app.get("/api/trips/{trip_id}/view")
def trip_view(trip_id: int, session: Session = Depends(get_session)) -> dict:
    trip = session.scalar(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.timelines).selectinload(Timeline.bookings).selectinload(Booking.timelines),
            selectinload(Trip.bookings).selectinload(Booking.timelines),
            selectinload(Trip.travel_events),
        )
    )
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")

    today = date.today()
    booking_payload = {
        booking.id: {
            **booking_read(booking).model_dump(mode="json"),
            **timeline_segment(booking, trip.start_date),
            "cancellation_label": future_cancellation_label(booking, today),
            "shared_count": len(booking.timelines),
        }
        for booking in trip.bookings
    }

    timelines = sorted(trip.timelines, key=lambda timeline: (0 if timeline.kind == "confirmed" else 1, timeline.order_index, timeline.id))
    lanes = []
    for timeline in timelines:
        assigned = sorted(timeline.bookings, key=lambda booking: (booking.arrival_date, booking.departure_date, booking.hotel_name))
        lanes.append(
            {
                "id": f"timeline-{timeline.id}",
                "timeline_id": timeline.id,
                "name": timeline.name,
                "kind": timeline.kind,
                "color": timeline.color,
                "bookings": [booking_payload[booking.id] for booking in assigned],
                "bag_gaps": bag_gaps(assigned, trip.start_date),
                "travel_events": [],
                "total_price_eur": sum(booking.price_eur or 0 for booking in assigned),
            }
        )

    assigned_ids = {booking.id for timeline in trip.timelines for booking in timeline.bookings}
    unsorted = [booking for booking in trip.bookings if booking.id not in assigned_ids]
    travel_events = [
        {
            "id": event.id,
            "trip_id": event.trip_id,
            "travel_date": event.travel_date.isoformat(),
            "mode": event.mode,
            "label": event.label,
            "offset": (event.travel_date - trip.start_date).days + 0.5,
        }
        for event in sorted(trip.travel_events, key=lambda travel_event: (travel_event.travel_date, travel_event.id))
    ]
    insert_at = 1 if lanes and lanes[0]["kind"] == "confirmed" else 0
    lanes.insert(
        insert_at,
        {
            "id": "travel",
            "timeline_id": None,
            "name": "Travel",
            "kind": "travel",
            "color": "#e8d7a8",
            "bookings": [],
            "bag_gaps": [],
            "travel_events": travel_events,
            "total_price_eur": 0,
        },
    )
    lanes.append(
        {
            "id": "unsorted",
            "timeline_id": None,
            "name": "Unsorted",
            "kind": "unsorted",
            "color": "#d9dde7",
            "bookings": [booking_payload[booking.id] for booking in sorted(unsorted, key=lambda booking: (booking.arrival_date, booking.hotel_name))],
            "bag_gaps": [],
            "travel_events": [],
            "total_price_eur": sum(booking.price_eur or 0 for booking in unsorted),
        }
    )

    return {
        "trip": TripRead(id=trip.id, name=trip.name, start_date=trip.start_date, end_date=trip.end_date, trip_url=trip.trip_url).model_dump(mode="json"),
        "dates": [day.isoformat() for day in date_range(trip.start_date, trip.end_date)],
        "lanes": lanes,
    }
