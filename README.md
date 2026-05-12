# travel-manager

Single-user trip accommodation timeline manager. Compare hotel bookings across candidate timelines for a trip — track arrival/departure, bag gaps, cancellation deadlines, and per-timeline cost — then commit a "Confirmed" timeline once you've made your choices.

## Stack

- **Backend**: FastAPI + SQLAlchemy + SQLite (single-file DB under `local/`)
- **Frontend**: React 18 + TypeScript + Vite
- **Python runtime**: `uv` (>=3.12)

## Run

Backend:

```bash
uv run uvicorn backend.main:app --reload
```

Frontend:

```bash
npm install
npm run dev
```

The frontend dev server (Vite, port 5173) is allowed by the backend's CORS config.

## Tests

```bash
uv run pytest
```
