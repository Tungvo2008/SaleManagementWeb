Repo gồm:

- `backend/` — FastAPI
- `frontend/` — React (CRA)

## Run Backend (FastAPI)

```bash
cd backend
source .venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Run Frontend (React)

```bash
cd frontend
npm install
npm start
```

## Deploy

Xem hướng dẫn ở `DEPLOY.md`.
