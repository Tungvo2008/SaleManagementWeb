from __future__ import annotations

"""
Dev-only database reset using Alembic.

What this does:
- Deletes the local SQLite file (if applicable)
- Recreates schema by running `alembic upgrade head`

Why this exists:
- When using migrations, you generally should NOT use `create_all()` because it
  bypasses Alembic history and can drift from real upgrade paths.
"""

from pathlib import Path
import os

from alembic import command
from alembic.config import Config

from app.core.config import settings


def _resolve_sqlite_path(url: str) -> Path | None:
    if not url.startswith("sqlite:///") or ":memory:" in url:
        return None
    raw = url.removeprefix("sqlite:///")
    backend_dir = Path(__file__).resolve().parents[2]
    p = Path(raw)
    if not p.is_absolute():
        p = (backend_dir / p).resolve()
    return p


def reset_db() -> None:
    db_path = _resolve_sqlite_path(settings.DATABASE_URL)
    if db_path is not None and db_path.exists():
        os.remove(db_path)

    project_root = Path(__file__).resolve().parents[2]  # backend/
    ini_path = project_root / "alembic.ini"
    cfg = Config(str(ini_path))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    command.upgrade(cfg, "head")


if __name__ == "__main__":
    reset_db()
    print("DB reset complete (delete sqlite file + alembic upgrade head).")

