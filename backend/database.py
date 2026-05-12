from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = Path(os.environ.get("DB_DIR", ROOT / "local")) / "travel-manager.sqlite3"


class Base(DeclarativeBase):
    pass


def database_url() -> str:
    DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{DEFAULT_DB_PATH}"


engine = create_engine(database_url(), connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    from backend import models

    Base.metadata.create_all(bind=engine)
    migrate_sqlite()


def migrate_sqlite() -> None:
    inspector = inspect(engine)
    if "bookings" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("bookings")}
    with engine.begin() as connection:
        if "price_eur" not in columns:
            connection.execute(text("ALTER TABLE bookings ADD COLUMN price_eur FLOAT NOT NULL DEFAULT 0.0"))
    if "trips" not in inspector.get_table_names():
        return
    trip_columns = {column["name"] for column in inspector.get_columns("trips")}
    with engine.begin() as connection:
        if "trip_url" not in trip_columns:
            connection.execute(text("ALTER TABLE trips ADD COLUMN trip_url VARCHAR(1000) NOT NULL DEFAULT ''"))


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    with session_scope() as session:
        yield session
