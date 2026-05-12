from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, model_validator


class TripCreate(BaseModel):
    name: str = Field(min_length=1)
    start_date: date
    end_date: date
    trip_url: str = ""

    @model_validator(mode="after")
    def validate_dates(self) -> "TripCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class TripRead(TripCreate):
    id: int


class BookingBase(BaseModel):
    hotel_name: str = Field(min_length=1)
    city: str = Field(min_length=1)
    arrival_date: date
    departure_date: date
    checkin_time: str = "15:00"
    checkout_time: str = "11:00"
    cancellation_policy: str = "unknown"
    cancellable_until: date | None = None
    price_eur: float = 0.0
    notes: str = ""
    booking_url: str = ""

    @model_validator(mode="after")
    def validate_booking(self) -> "BookingBase":
        if self.departure_date <= self.arrival_date:
            raise ValueError("departure_date must be after arrival_date")
        if self.cancellation_policy != "free_cancellation_until":
            self.cancellable_until = None
        return self


class BookingCreate(BookingBase):
    pass


class BookingUpdate(BookingBase):
    pass


class BookingRead(BookingBase):
    id: int
    trip_id: int
    timeline_ids: list[int] = []


class TimelineCreate(BaseModel):
    name: str = Field(min_length=1)
    color: str = "#9bc6ff"


class TimelineUpdate(BaseModel):
    name: str = Field(min_length=1)


class TimelineReorder(BaseModel):
    before_timeline_id: int | None = None
    after_timeline_id: int | None = None


class TimelineRead(TimelineCreate):
    id: int
    trip_id: int
    kind: str
    order_index: int


class TravelEventBase(BaseModel):
    travel_date: date
    mode: str = "train"
    label: str = ""


class TravelEventCreate(TravelEventBase):
    pass


class TravelEventRead(TravelEventBase):
    id: int
    trip_id: int
    offset: float
