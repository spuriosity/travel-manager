from datetime import date

from backend.domain import BookingLike, future_cancellation_label, sleep_nights, timeline_segment


def booking(**overrides):
    data = {
        "id": 1,
        "hotel_name": "Kyoto Inn",
        "city": "Kyoto",
        "arrival_date": date(2026, 5, 3),
        "departure_date": date(2026, 5, 6),
        "checkin_time": "15:00",
        "checkout_time": "11:00",
        "cancellation_policy": "free_cancellation_until",
        "cancellable_until": date(2026, 5, 1),
    }
    data.update(overrides)
    return BookingLike(**data)


def test_should_return_sleep_nights_excluding_departure_date():
    assert sleep_nights(date(2026, 5, 3), date(2026, 5, 6)) == [
        date(2026, 5, 3),
        date(2026, 5, 4),
        date(2026, 5, 5),
    ]


def test_should_position_stay_interval_with_checkin_and_checkout_offsets():
    segment = timeline_segment(booking(), date(2026, 5, 1))

    assert segment["start_offset"] == 2 + 15 / 24
    assert segment["end_offset"] == 5 + 11 / 24


def test_should_render_future_cancellation_label_as_day_and_month():
    label = future_cancellation_label(booking(cancellable_until=date(2026, 5, 20)), date(2026, 5, 11))

    assert label == "Cancel before 20 May"


def test_should_not_render_passed_cancellation_label():
    label = future_cancellation_label(booking(cancellable_until=date(2026, 5, 10)), date(2026, 5, 11))

    assert label is None
