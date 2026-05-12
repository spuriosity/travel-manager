import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bike, CalendarPlus, Car, Copy, ExternalLink, GripVertical, Hotel, MoveVertical, Pencil, Plane, Plus, Sailboat, Train, Trash2, X } from "lucide-react";
import "./styles.css";

const API = (import.meta.env.VITE_API_BASE ?? "/api").replace(/\/$/, "");
const DAY_WIDTH = 220;
const TOTAL_WIDTH = 132;
const MIN_BOOKING_WIDTH = 230;
const MIN_ONE_NIGHT_BOOKING_WIDTH = 190;
const BOOKING_TRACK_HEIGHT = 112;

type Trip = { id: number; name: string; start_date: string; end_date: string; trip_url: string };
type Booking = {
  id: number;
  hotel_name: string;
  city: string;
  arrival_date: string;
  departure_date: string;
  checkin_time: string;
  checkout_time: string;
  cancellation_policy: string;
  cancellable_until: string | null;
  price_eur: number;
  notes: string;
  booking_url: string;
  timeline_ids: number[];
  start_offset: number;
  end_offset: number;
  cancellation_label: string | null;
  shared_count: number;
  sleep_markers: { date: string; offset: number; label: string }[];
};
type Lane = {
  id: string;
  timeline_id: number | null;
  name: string;
  kind: "confirmed" | "candidate" | "unsorted" | "travel";
  color: string;
  bookings: Booking[];
  bag_gaps: { start_offset: number; end_offset: number; label: string }[];
  travel_events: TravelEvent[];
  total_price_eur: number;
};
type TripView = { trip: Trip; dates: string[]; lanes: Lane[] };
type TravelEvent = { id: number; trip_id: number; travel_date: string; mode: "plane" | "train" | "car" | "boat" | "bicycle"; label: string; offset: number };

type BookingForm = {
  hotel_name: string;
  city: string;
  arrival_date: string;
  departure_date: string;
  cancellation_policy: string;
  cancellable_until: string;
  price_eur: string;
  notes: string;
  booking_url: string;
};

const emptyBooking = (trip?: Trip): BookingForm => ({
  hotel_name: "",
  city: "",
  arrival_date: trip?.start_date ?? "",
  departure_date: trip?.end_date ?? "",
  cancellation_policy: "unknown",
  cancellable_until: "",
  price_eur: "",
  notes: "",
  booking_url: "",
});

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || response.statusText);
  }
  return response.json();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<number | null>(null);
  const [view, setView] = useState<TripView | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingForm | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<number | null>(null);
  const [tripForm, setTripForm] = useState({ name: "", start_date: "", end_date: "", trip_url: "" });
  const [showTripForm, setShowTripForm] = useState(false);
  const [editingTripId, setEditingTripId] = useState<number | null>(null);
  const [travelForm, setTravelForm] = useState({ travel_date: "", mode: "train", label: "" });
  const [showTravelForm, setShowTravelForm] = useState(false);
  const [timelineName, setTimelineName] = useState("");
  const [editingTimelineId, setEditingTimelineId] = useState<number | null>(null);
  const [editingTimelineName, setEditingTimelineName] = useState("");
  const [dragTimeline, setDragTimeline] = useState<{ timelineId: number; x: number; y: number } | null>(null);
  const [dragTimelineTargetId, setDragTimelineTargetId] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ booking: Booking; sourceTimelineId: number | null; x: number; y: number } | null>(null);
  const [dragTargetLaneId, setDragTargetLaneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  async function loadTrips() {
    const result = await request<Trip[]>("/trips");
    setTrips(result);
    if (!activeTripId && result.length > 0) setActiveTripId(result[0].id);
  }

  async function loadView(tripId = activeTripId) {
    if (!tripId) return;
    const result = await request<TripView>(`/trips/${tripId}/view`);
    setView(result);
  }

  useEffect(() => {
    loadTrips().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadView().catch((err) => setError(err.message));
  }, [activeTripId]);

  useEffect(() => {
    function move(event: PointerEvent) {
      const lane = document.elementsFromPoint(event.clientX, event.clientY).find((element) => element instanceof HTMLElement && element.dataset.laneId) as HTMLElement | undefined;
      setDragTargetLaneId(lane?.dataset.laneId ?? null);
      setDrag((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
    }
    async function up(event: PointerEvent) {
      if (!drag || !activeTripId) return;
      const lane = document.elementsFromPoint(event.clientX, event.clientY).find((element) => element instanceof HTMLElement && element.dataset.laneId) as HTMLElement | undefined;
      setDrag(null);
      setDragTargetLaneId(null);
      if (!lane) return;
      const target = lane.dataset.laneId;
      try {
        if (target === "unsorted" && drag.sourceTimelineId !== null) {
          await request(`/trips/${activeTripId}/timelines/${drag.sourceTimelineId}/bookings/${drag.booking.id}`, { method: "DELETE" });
        } else if (target && target !== "unsorted") {
          await request(`/trips/${activeTripId}/timelines/${target}/bookings/${drag.booking.id}`, { method: "POST" });
          if (drag.sourceTimelineId !== null && target !== String(drag.sourceTimelineId)) {
            await request(`/trips/${activeTripId}/timelines/${drag.sourceTimelineId}/bookings/${drag.booking.id}`, { method: "DELETE" });
          }
        }
        await loadView();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Drag action failed");
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, activeTripId]);

  useEffect(() => {
    function move(event: PointerEvent) {
      const lane = document.elementsFromPoint(event.clientX, event.clientY)
        .find((element) => element instanceof HTMLElement && element.closest("[data-timeline-id]")) as HTMLElement | undefined;
      const targetTimeline = lane?.closest("[data-timeline-id]") as HTMLElement | null;
      setDragTimelineTargetId(targetTimeline ? Number(targetTimeline.dataset.timelineId) : null);
      setDragTimeline((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
    }
    async function up(event: PointerEvent) {
      if (!dragTimeline || !activeTripId) return;
      const lane = document.elementsFromPoint(event.clientX, event.clientY)
        .find((element) => element instanceof HTMLElement && element.closest("[data-timeline-id]")) as HTMLElement | undefined;
      const targetLane = lane?.closest("[data-timeline-id]") as HTMLElement | null;
      setDragTimeline(null);
      setDragTimelineTargetId(null);
      if (!targetLane) return;
      const targetTimelineId = Number(targetLane.dataset.timelineId);
      if (!targetTimelineId || targetTimelineId === dragTimeline.timelineId) return;
      const rect = targetLane.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      try {
        await request(`/trips/${activeTripId}/timelines/${dragTimeline.timelineId}/reorder`, {
          method: "PUT",
          body: JSON.stringify(before ? { before_timeline_id: targetTimelineId } : { after_timeline_id: targetTimelineId }),
        });
        await loadView();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lane reorder failed");
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragTimeline, activeTripId]);

  const totalWidth = useMemo(() => `${(view?.dates.length ?? 1) * DAY_WIDTH}px`, [view]);
  const laneWidth = useMemo(() => `${(view?.dates.length ?? 1) * DAY_WIDTH + TOTAL_WIDTH}px`, [view]);
  const sleepingByDate = useMemo(() => {
    if (!view) return new Map<string, string[]>();
    const byDate = new Map<string, string[]>();
    for (const lane of view.lanes) {
      if (lane.kind === "unsorted") continue;
      for (const booking of lane.bookings) {
        for (const marker of booking.sleep_markers) {
          const current = byDate.get(marker.date) ?? [];
          if (!current.includes(booking.city)) current.push(booking.city);
          byDate.set(marker.date, current);
        }
      }
    }
    return byDate;
  }, [view]);

  async function createTrip(payload = tripForm) {
    const trip = await request<Trip>("/trips", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setActiveTripId(trip.id);
    setTripForm({ name: "", start_date: "", end_date: "", trip_url: "" });
    setShowTripForm(false);
    await loadTrips();
  }

  async function saveTripDetails() {
    if (!editingTripId) {
      await createTrip();
      return;
    }
    const trip = await request<Trip>(`/trips/${editingTripId}`, {
      method: "PUT",
      body: JSON.stringify(tripForm),
    });
    setActiveTripId(trip.id);
    setTripForm({ name: "", start_date: "", end_date: "", trip_url: "" });
    setEditingTripId(null);
    setShowTripForm(false);
    await loadTrips();
    await loadView(trip.id);
  }

  function openEditTrip() {
    if (!view) return;
    setTripForm({
      name: view.trip.name,
      start_date: view.trip.start_date,
      end_date: view.trip.end_date,
      trip_url: view.trip.trip_url,
    });
    setEditingTripId(view.trip.id);
    setShowTripForm(true);
  }

  function openCreateTrip() {
    setTripForm({ name: "", start_date: "", end_date: "", trip_url: "" });
    setEditingTripId(null);
    setShowTripForm((value) => !value);
  }

  function openNewBooking() {
    setEditingBookingId(null);
    setBookingForm(emptyBooking(view?.trip));
  }

  function openEditBooking(booking: Booking) {
    setEditingBookingId(booking.id);
    setBookingForm({
      hotel_name: booking.hotel_name,
      city: booking.city,
      arrival_date: booking.arrival_date,
      departure_date: booking.departure_date,
      cancellation_policy: booking.cancellation_policy,
      cancellable_until: booking.cancellable_until ?? "",
      notes: booking.notes,
      booking_url: booking.booking_url,
      price_eur: booking.price_eur ? String(booking.price_eur) : "",
    });
  }

  async function saveBooking() {
    if (!view || !bookingForm) return;
    const payload = {
      ...bookingForm,
      checkin_time: "15:00",
      checkout_time: "11:00",
      cancellable_until: bookingForm.cancellation_policy === "free_cancellation_until" ? bookingForm.cancellable_until || null : null,
      price_eur: Number(bookingForm.price_eur || 0),
    };
    const path = editingBookingId ? `/trips/${view.trip.id}/bookings/${editingBookingId}` : `/trips/${view.trip.id}/bookings`;
    await request(path, { method: editingBookingId ? "PUT" : "POST", body: JSON.stringify(payload) });
    setBookingForm(null);
    setEditingBookingId(null);
    await loadView();
  }

  async function createTimeline() {
    if (!view || !timelineName.trim()) return;
    const colors = ["#9bc6ff", "#f6c6d6", "#f9d99a", "#cdb7f6", "#a7ded9", "#ffc4a3"];
    await request(`/trips/${view.trip.id}/timelines`, {
      method: "POST",
      body: JSON.stringify({ name: timelineName.trim(), color: colors[Math.floor(Math.random() * colors.length)] }),
    });
    setTimelineName("");
    await loadView();
  }

  function openRenameTimeline(timelineId: number, currentName: string) {
    setEditingTimelineId(timelineId);
    setEditingTimelineName(currentName);
  }

  async function saveTimelineName() {
    if (!view || editingTimelineId === null || !editingTimelineName.trim()) return;
    await request(`/trips/${view.trip.id}/timelines/${editingTimelineId}`, {
      method: "PUT",
      body: JSON.stringify({ name: editingTimelineName.trim() }),
    });
    setEditingTimelineId(null);
    setEditingTimelineName("");
    await loadView();
  }

  function cancelRenameTimeline() {
    setEditingTimelineId(null);
    setEditingTimelineName("");
  }

  async function duplicateBooking(bookingId: number) {
    if (!view) return;
    await request(`/trips/${view.trip.id}/bookings/${bookingId}/duplicate`, { method: "POST" });
    await loadView();
  }

  async function removeFromLane(timelineId: number | null, bookingId: number) {
    if (!view || timelineId === null) return;
    await request(`/trips/${view.trip.id}/timelines/${timelineId}/bookings/${bookingId}`, { method: "DELETE" });
    await loadView();
  }

  async function deleteBooking(bookingId: number) {
    if (!view) return;
    await request(`/trips/${view.trip.id}/bookings/${bookingId}`, { method: "DELETE" });
    await loadView();
  }

  async function createTravelEvent() {
    if (!view || !travelForm.travel_date) return;
    await request(`/trips/${view.trip.id}/travel-events`, {
      method: "POST",
      body: JSON.stringify(travelForm),
    });
    setTravelForm({ travel_date: "", mode: "train", label: "" });
    setShowTravelForm(false);
    await loadView();
  }

  async function deleteTravelEvent(travelEventId: number) {
    if (!view) return;
    await request(`/trips/${view.trip.id}/travel-events/${travelEventId}`, { method: "DELETE" });
    await loadView();
  }

  function openTravelForDate(travelDate: string) {
    setTravelForm({ travel_date: travelDate, mode: "train", label: "" });
    setShowTravelForm(true);
  }

  if (!view) {
    return (
      <main className="empty-shell">
        <section className="empty-panel">
          <Hotel size={38} />
          <h1>Travel Manager</h1>
          <p>Create a trip to start arranging hotel timelines.</p>
          {trips.length > 0 && (
            <select value={activeTripId ?? ""} onChange={(event) => setActiveTripId(Number(event.target.value))}>
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>{trip.name}</option>
              ))}
            </select>
          )}
          <div className="trip-create">
            <input placeholder="Trip name" value={tripForm.name} onChange={(event) => setTripForm({ ...tripForm, name: event.target.value })} />
            <input type="date" value={tripForm.start_date} onChange={(event) => setTripForm({ ...tripForm, start_date: event.target.value })} />
            <input type="date" value={tripForm.end_date} onChange={(event) => setTripForm({ ...tripForm, end_date: event.target.value })} />
          </div>
          <button disabled={!tripForm.name || !tripForm.start_date || !tripForm.end_date} onClick={() => createTrip()}><CalendarPlus size={18} /> Create trip</button>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Accommodation timelines</p>
          <h1>{view.trip.name}</h1>
          <span>{formatDate(view.trip.start_date)} - {formatDate(view.trip.end_date)}</span>
        </div>
        <div className="topbar-actions">
          <select value={activeTripId ?? ""} onChange={(event) => setActiveTripId(Number(event.target.value))}>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>{trip.name}</option>
            ))}
          </select>
          <button className="secondary" onClick={openEditTrip}><Pencil size={18} /> Edit trip</button>
          {view.trip.trip_url && (
            <a className="button-link secondary" href={view.trip.trip_url} target="_blank" rel="noreferrer">
              <ExternalLink size={18} /> Go to URL
            </a>
          )}
          <button className="secondary" onClick={openCreateTrip}><CalendarPlus size={18} /> New trip</button>
          <button className="secondary" onClick={() => setShowTravelForm((value) => !value)}><Train size={18} /> Travel</button>
          <button onClick={openNewBooking}><Plus size={18} /> Booking</button>
        </div>
      </header>

      {showTripForm && (
        <section className="trip-create inline-trip-create">
          <input placeholder="Trip name" value={tripForm.name} onChange={(event) => setTripForm({ ...tripForm, name: event.target.value })} />
          <input type="date" value={tripForm.start_date} onChange={(event) => setTripForm({ ...tripForm, start_date: event.target.value })} />
          <input type="date" value={tripForm.end_date} onChange={(event) => setTripForm({ ...tripForm, end_date: event.target.value })} />
          <input placeholder="Trip URL" value={tripForm.trip_url} onChange={(event) => setTripForm({ ...tripForm, trip_url: event.target.value })} />
          <button disabled={!tripForm.name || !tripForm.start_date || !tripForm.end_date} onClick={saveTripDetails}>
            {editingTripId ? <Pencil size={18} /> : <CalendarPlus size={18} />}
            {editingTripId ? "Save trip" : "Create trip"}
          </button>
        </section>
      )}

      <section className="lane-tools">
        <input value={timelineName} onChange={(event) => setTimelineName(event.target.value)} placeholder="New swimlane name" />
        <button onClick={createTimeline}><Plus size={18} /> Add swimlane</button>
      </section>

      {error && <div className="error-strip">{error}<button onClick={() => setError(null)}><X size={14} /></button></div>}

      <section className="board" ref={boardRef}>
        <div className="board-scroll">
          <div className="sleeping-row">
            <div className="sleeping-label">Sleeping in</div>
            <div className="sleeping-grid" style={{ width: totalWidth }}>
              {view.dates.map((day) => <div className="sleeping-grid-cell" key={day} />)}
              {view.dates.map((day, index) => {
                const cities = sleepingByDate.get(day) ?? [];
                if (cities.length === 0) return null;
                return (
                  <div className="sleeping-boundary-label" key={`sleep-${day}`} style={{ left: `${(index + 1) * DAY_WIDTH}px` }}>
                    {cities.join(" / ")}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="date-row">
            <div className="lane-label spacer" />
            <div className="date-grid" style={{ width: totalWidth }}>
              {view.dates.map((day) => <div className="date-cell" key={day}>{formatDate(day)}</div>)}
            </div>
          </div>
          {view.lanes.map((lane) => (
            <TimelineLane
              key={lane.id}
              lane={lane}
              dates={view.dates}
              totalWidth={totalWidth}
              onDragStart={(booking, x, y) => setDrag({ booking, sourceTimelineId: lane.timeline_id, x, y })}
              onDuplicate={duplicateBooking}
              onRemove={removeFromLane}
              onDelete={deleteBooking}
              onEdit={openEditBooking}
              onDeleteTravel={deleteTravelEvent}
              onAddTravel={openTravelForDate}
              laneWidth={laneWidth}
              editingTimelineId={editingTimelineId}
              editingTimelineName={editingTimelineName}
              onStartRenameTimeline={openRenameTimeline}
              onChangeTimelineName={setEditingTimelineName}
              onSaveTimelineName={saveTimelineName}
              onCancelTimelineName={cancelRenameTimeline}
              onStartDragTimeline={(timelineId, x, y) => setDragTimeline({ timelineId, x, y })}
              dragTimelineTargetId={dragTimelineTargetId}
              dragPreview={drag?.booking}
              isDragTarget={dragTargetLaneId === String(lane.timeline_id ?? "unsorted")}
            />
          ))}
        </div>
      </section>

      {bookingForm && (
        <div className="modal-backdrop">
          <section className="booking-modal">
            <header>
              <h2>{editingBookingId ? "Edit booking" : "New booking"}</h2>
              <button onClick={() => { setBookingForm(null); setEditingBookingId(null); }}><X size={18} /></button>
            </header>
            <label>Hotel<input value={bookingForm.hotel_name} onChange={(e) => setBookingForm({ ...bookingForm, hotel_name: e.target.value })} /></label>
            <label>City<input value={bookingForm.city} onChange={(e) => setBookingForm({ ...bookingForm, city: e.target.value })} /></label>
            <div className="form-grid">
              <label>Arrival<input type="date" value={bookingForm.arrival_date} onChange={(e) => setBookingForm({ ...bookingForm, arrival_date: e.target.value })} /></label>
              <label>Departure<input type="date" value={bookingForm.departure_date} onChange={(e) => setBookingForm({ ...bookingForm, departure_date: e.target.value })} /></label>
            </div>
            <label>Cancellation
              <select
                value={bookingForm.cancellation_policy}
                onChange={(e) => {
                  const nextPolicy = e.target.value;
                  setBookingForm({
                    ...bookingForm,
                    cancellation_policy: nextPolicy,
                    cancellable_until:
                      nextPolicy === "free_cancellation_until" && !bookingForm.cancellable_until
                        ? bookingForm.arrival_date
                        : bookingForm.cancellable_until,
                  });
                }}
              >
                <option value="unknown">Unknown</option>
                <option value="free_cancellation_until">Free cancellation</option>
                <option value="non_refundable">Non-refundable</option>
              </select>
            </label>
            {bookingForm.cancellation_policy === "free_cancellation_until" && (
              <label>Cancellable until<input type="date" value={bookingForm.cancellable_until} onChange={(e) => setBookingForm({ ...bookingForm, cancellable_until: e.target.value })} /></label>
            )}
            <label>Price EUR<input type="number" min="0" step="0.01" value={bookingForm.price_eur} onChange={(e) => setBookingForm({ ...bookingForm, price_eur: e.target.value })} /></label>
            <label>Booking URL<input value={bookingForm.booking_url} onChange={(e) => setBookingForm({ ...bookingForm, booking_url: e.target.value })} /></label>
            <label>Notes<textarea value={bookingForm.notes} onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })} /></label>
            <footer>
              <button className="secondary" onClick={() => { setBookingForm(null); setEditingBookingId(null); }}>Cancel</button>
              <button onClick={saveBooking}>{editingBookingId ? "Save changes" : "Save booking"}</button>
            </footer>
          </section>
        </div>
      )}

      {showTravelForm && (
        <div className="modal-backdrop" onClick={() => setShowTravelForm(false)}>
          <section className="travel-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Add travel</h2>
              <button onClick={() => setShowTravelForm(false)}><X size={18} /></button>
            </header>
            <label>Date<input type="date" value={travelForm.travel_date} onChange={(event) => setTravelForm({ ...travelForm, travel_date: event.target.value })} /></label>
            <div className="travel-mode-grid">
              {([
                ["plane", Plane, "Plane"],
                ["train", Train, "Train"],
                ["car", Car, "Car"],
                ["boat", Sailboat, "Boat"],
                ["bicycle", Bike, "Bicycle"],
              ] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`travel-mode-option ${travelForm.mode === mode ? "active" : ""}`}
                  onClick={() => setTravelForm({ ...travelForm, mode })}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <label>Optional text<input placeholder="Tokyo to Kyoto" value={travelForm.label} onChange={(event) => setTravelForm({ ...travelForm, label: event.target.value })} /></label>
            <footer>
              <button className="secondary" onClick={() => setShowTravelForm(false)}>Cancel</button>
              <button disabled={!travelForm.travel_date} onClick={createTravelEvent}><Plus size={18} /> Add travel</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

function TimelineLane({
  lane,
  dates,
  totalWidth,
  onDragStart,
  onDuplicate,
  onRemove,
  onDelete,
  onEdit,
  onDeleteTravel,
  onAddTravel,
  laneWidth,
  editingTimelineId,
  editingTimelineName,
  onStartRenameTimeline,
  onChangeTimelineName,
  onSaveTimelineName,
  onCancelTimelineName,
  onStartDragTimeline,
  dragTimelineTargetId,
  dragPreview,
  isDragTarget,
}: {
  lane: Lane;
  dates: string[];
  totalWidth: string;
  onDragStart: (booking: Booking, x: number, y: number) => void;
  onDuplicate: (bookingId: number) => void;
  onRemove: (timelineId: number | null, bookingId: number) => void;
  onDelete: (bookingId: number) => void;
  onEdit: (booking: Booking) => void;
  onDeleteTravel: (travelEventId: number) => void;
  onAddTravel: (travelDate: string) => void;
  laneWidth: string;
  editingTimelineId: number | null;
  editingTimelineName: string;
  onStartRenameTimeline: (timelineId: number, currentName: string) => void;
  onChangeTimelineName: (value: string) => void;
  onSaveTimelineName: () => void;
  onCancelTimelineName: () => void;
  onStartDragTimeline: (timelineId: number, x: number, y: number) => void;
  dragTimelineTargetId: number | null;
  dragPreview?: Booking;
  isDragTarget: boolean;
}) {
  if (lane.kind === "travel") {
    return (
      <div className="lane travel-lane">
        <div className="lane-label travel-lane-label">
          <span className="lane-swatch" style={{ background: lane.color }} />
          <strong>{lane.name}</strong>
        </div>
        <div className="lane-canvas travel-canvas" style={{ width: laneWidth }}>
          {dates.map((day) => (
            <button
              className="grid-line travel-grid-line travel-day-target"
              key={day}
              onClick={() => onAddTravel(day)}
              aria-label={`Add travel on ${formatDate(day)}`}
            />
          ))}
          {lane.travel_events.map((event) => (
            <button
              className="travel-dot"
              key={event.id}
              style={{ left: `${event.offset * DAY_WIDTH}px` }}
              onClick={() => onDeleteTravel(event.id)}
              aria-label={`Delete ${event.mode} travel event`}
              data-tooltip={event.label || `Delete ${event.mode}`}
            >
              <TravelIcon mode={event.mode} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const packedBookings = packBookings(lane.bookings);
  const trackCount = Math.max(1, ...packedBookings.map((item) => item.track + 1));
  const laneHeight = 118 + (trackCount - 1) * BOOKING_TRACK_HEIGHT;

  return (
    <div className={`lane lane-${lane.kind}`} data-lane-id={lane.timeline_id ?? "unsorted"} data-timeline-id={lane.kind === "candidate" ? lane.timeline_id ?? undefined : undefined}>
      <div className="lane-label" style={{ minHeight: `${laneHeight}px` }}>
        <div className="lane-label-topline">
          <span className="lane-swatch" style={{ background: lane.color }} />
          {lane.timeline_id !== null && lane.kind === "candidate" && (
            <button
              type="button"
              className="drag-handle lane-drag-handle"
              aria-label={`Drag ${lane.name}`}
              data-tooltip="Move lane"
              onPointerDown={(event) => {
                event.preventDefault();
                (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                onStartDragTimeline(lane.timeline_id as number, event.clientX, event.clientY);
              }}
            >
              <MoveVertical size={14} />
            </button>
          )}
        </div>
        {lane.timeline_id !== null && lane.kind !== "unsorted" && editingTimelineId === lane.timeline_id ? (
          <input
            className="lane-rename-input"
            autoFocus
            value={editingTimelineName}
            onChange={(event) => onChangeTimelineName(event.target.value)}
            onBlur={onSaveTimelineName}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveTimelineName();
              if (event.key === "Escape") onCancelTimelineName();
            }}
            style={dragTimelineTargetId === lane.timeline_id ? { boxShadow: "0 0 0 2px rgba(45, 70, 84, 0.18)" } : undefined}
          />
        ) : (
          <button
            type="button"
            className="lane-name-button"
            onClick={() => lane.timeline_id !== null && lane.kind !== "unsorted" && onStartRenameTimeline(lane.timeline_id, lane.name)}
            style={dragTimelineTargetId === lane.timeline_id ? { boxShadow: "0 0 0 2px rgba(45, 70, 84, 0.18)" } : undefined}
          >
            <strong>{lane.name}</strong>
          </button>
        )}
        <small>{lane.kind === "unsorted" ? "Loose bookings" : `${lane.bookings.length} bookings`}</small>
      </div>
      <div className="lane-canvas" style={{ width: laneWidth, minHeight: `${laneHeight}px` }}>
        {dates.map((day) => <div className="grid-line" key={day} />)}
        {lane.bag_gaps.map((gap) => (
          <div key={`${gap.start_offset}-${gap.end_offset}`} className="bag-gap" style={{ left: `${gap.start_offset * DAY_WIDTH}px`, width: `${(gap.end_offset - gap.start_offset) * DAY_WIDTH}px` }}>{gap.label}</div>
        ))}
        {lane.kind !== "unsorted" && (
          <div className="lane-total" style={{ left: `${dates.length * DAY_WIDTH + 12}px` }}>
            <span>Total</span>
            <strong>€{lane.total_price_eur.toLocaleString("en-GB", { maximumFractionDigits: 2 })}</strong>
          </div>
        )}
        {packedBookings.map(({ booking, track }) => (
          <article
            className={`booking-pill ${isOneNightBooking(booking) ? "booking-pill-short" : ""}`}
            key={booking.id}
          style={{
            left: `${booking.start_offset * DAY_WIDTH}px`,
            width: `${bookingVisualWidth(booking)}px`,
            top: `${22 + track * BOOKING_TRACK_HEIGHT}px`,
            zIndex: 20 + track,
            borderColor: lane.color,
            background: `linear-gradient(90deg, ${lane.color} 0%, color-mix(in srgb, ${lane.color} 52%, white) 100%)`,
          }}
          >
            <button
              className="drag-handle"
              onPointerDown={(event) => {
                event.preventDefault();
                (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                onDragStart(booking, event.clientX, event.clientY);
              }}
              aria-label="Drag to add or remove from swimlanes"
              data-tooltip="Drag to group"
            >
              <GripVertical size={16} />
            </button>
            <div className="pill-copy">
              <strong>{booking.hotel_name}</strong>
              <span>{booking.city}</span>
              {booking.price_eur > 0 && <span className="price-line">€{booking.price_eur.toLocaleString("en-GB", { maximumFractionDigits: 2 })}</span>}
              {booking.cancellation_label && <em>{booking.cancellation_label}</em>}
              {booking.shared_count > 1 && <b>Shared in {booking.shared_count}</b>}
            </div>
            <div className="pill-actions">
              {booking.booking_url && (
                <a
                  className="pill-action-link"
                  href={booking.booking_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Go to booking URL"
                  data-tooltip="Go to URL"
                >
                  <ExternalLink size={14} />
                </a>
              )}
              <button onClick={() => onEdit(booking)} aria-label="Edit booking" data-tooltip="Edit"><Pencil size={14} /></button>
              {lane.kind !== "unsorted" && <button onClick={() => onRemove(lane.timeline_id, booking.id)} aria-label="Remove from this swimlane" data-tooltip="Remove"><X size={14} /></button>}
              <button onClick={() => onDuplicate(booking.id)} aria-label="Duplicate to Unsorted" data-tooltip="Duplicate"><Copy size={14} /></button>
              <button
                onClick={() => (lane.kind === "unsorted" || booking.shared_count === 1 ? onDelete(booking.id) : onRemove(lane.timeline_id, booking.id))}
                aria-label={lane.kind === "unsorted" || booking.shared_count === 1 ? "Delete booking" : "Remove from this swimlane"}
                data-tooltip={lane.kind === "unsorted" || booking.shared_count === 1 ? "Delete" : "Remove"}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </article>
        ))}
        {dragPreview && isDragTarget && !lane.bookings.some((booking) => booking.id === dragPreview.id) && (
          <article
            className={`booking-pill booking-ghost ${isOneNightBooking(dragPreview) ? "booking-pill-short" : ""}`}
          style={{
            left: `${dragPreview.start_offset * DAY_WIDTH}px`,
            width: `${bookingVisualWidth(dragPreview)}px`,
            borderColor: lane.color,
            zIndex: 10,
            background: `linear-gradient(90deg, ${lane.color} 0%, color-mix(in srgb, ${lane.color} 52%, white) 100%)`,
          }}
        >
            <div className="ghost-handle"><GripVertical size={16} /></div>
            <div className="pill-copy">
              <strong>{dragPreview.hotel_name}</strong>
              <span>{lane.kind === "unsorted" ? "Remove from swimlane" : `Add to ${lane.name}`}</span>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

function TravelIcon({ mode }: { mode: TravelEvent["mode"] }) {
  if (mode === "plane") return <Plane size={16} />;
  if (mode === "bicycle") return <Bike size={16} />;
  if (mode === "car") return <Car size={16} />;
  if (mode === "boat") return <Sailboat size={16} />;
  return <Train size={16} />;
}

function isOneNightBooking(booking: Booking) {
  const arrival = new Date(`${booking.arrival_date}T12:00:00`);
  const departure = new Date(`${booking.departure_date}T12:00:00`);
  return (departure.getTime() - arrival.getTime()) / 86_400_000 === 1;
}

function packBookings(bookings: Booking[]) {
  const tracks: number[] = [];
  return [...bookings]
    .sort((a, b) => a.start_offset - b.start_offset || a.end_offset - b.end_offset)
    .map((booking) => {
      const visualEnd = booking.start_offset + bookingVisualWidth(booking) / DAY_WIDTH;
      const track = tracks.findIndex((end) => end <= booking.start_offset);
      const resolvedTrack = track === -1 ? tracks.length : track;
      tracks[resolvedTrack] = visualEnd;
      return { booking, track: resolvedTrack };
    });
}

function bookingVisualWidth(booking: Booking) {
  const minimum = isOneNightBooking(booking) ? MIN_ONE_NIGHT_BOOKING_WIDTH : MIN_BOOKING_WIDTH;
  return Math.max((booking.end_offset - booking.start_offset) * DAY_WIDTH, minimum);
}

createRoot(document.getElementById("root")!).render(<App />);
