# Database Migrations (Alembic)

## Why this exists
- Schema changes are tracked by migration files in `alembic/versions`.
- App startup no longer calls `create_all()`.

## Commands
Run from:

```bash
cd "/Users/thanhtungvo/Web Bán Hàng - Project/backend"
```

Create a new migration after model changes:

```bash
./.venv/bin/alembic revision --autogenerate -m "describe_change"
```

Apply migrations:

```bash
./.venv/bin/alembic upgrade head
```

Rollback one revision:

```bash
./.venv/bin/alembic downgrade -1
```

## Existing local DB note
If your local `app.db` already matches current models (but has no Alembic history),
stamp it once instead of running `upgrade head`:

```bash
./.venv/bin/alembic stamp head
```

Use `upgrade head` only for fresh DBs or after real new revisions are added.
