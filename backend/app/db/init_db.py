from __future__ import annotations

"""
Initialize database schema using Alembic migrations.

Why:
- `Base.metadata.create_all()` creates tables from current models, but does not
  keep a history of schema changes (migrations).
- Alembic applies versioned migrations and tracks the current schema via
  `alembic_version`, so your DB can evolve without resetting.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config

from app.core.config import settings


def init_db() -> None:
    project_root = Path(__file__).resolve().parents[2]  # backend/
    ini_path = project_root / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    command.upgrade(cfg, "head")


if __name__ == "__main__":
    init_db()
    print("DB init complete (alembic upgrade head).")

