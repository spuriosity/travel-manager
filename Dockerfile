# --- Stage 1: build frontend ---
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
# vite-env.d.ts is already inside src/
RUN npm run build

# --- Stage 2: python runtime ---
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    STATIC_DIR=/app/dist \
    DB_DIR=/data

WORKDIR /app

RUN pip install --no-cache-dir \
        "fastapi>=0.115.0" \
        "pydantic>=2.9.0" \
        "sqlalchemy>=2.0.35" \
        "uvicorn[standard]>=0.30.6"

COPY backend ./backend
COPY pyproject.toml ./
COPY --from=frontend /app/dist ./dist

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
