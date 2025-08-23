# Deploy to Code Capsules (Flask + MySQL)

This guide describes how to deploy this repo on Code Capsules.

## 1) Prereqs
- A MySQL database reachable from the Capsule (external provider or a DB Capsule)
- Google Books API key
- Secrets ready to add as environment variables

## 2) Repo contents relevant to deployment
- `app.py` → Flask entrypoint (`app:app`)
- `Procfile` → `web: gunicorn app:app --bind 0.0.0.0:$PORT --workers 3 --timeout 120`
- `requirements.txt` → includes `gunicorn`
- `runtime.txt` → Python version
- `DEPLOYMENT_CONTEXT.md` → architecture overview
- `.env.example` → template of required variables

## 3) Create an App Capsule
1. Push this repo to GitHub (public or private).
2. In Code Capsules:
   - Create a new Capsule → Type: Web Service → Runtime: Python.
   - Link to your GitHub repo and branch.
   - Build command: `pip install -r requirements.txt`
   - Start command: Leave empty (Procfile will be detected) or explicitly set the same as in `Procfile`.

## 4) Configure Environment Variables
Add these in the Capsule settings:
- SECRET_KEY
- MYSQL_HOST
- MYSQL_PORT (e.g., 3306)
- MYSQL_USER
- MYSQL_PASSWORD
- MYSQL_DB
- GOOGLE_BOOKS_API_KEY
- (optional) DEBUG=1 during testing

## 5) Database Setup
Run this SQL on your MySQL instance before first run:
```
CREATE DATABASE IF NOT EXISTS your_db_name CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE your_db_name;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  avatar VARCHAR(512) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
Shelves tables are auto-created on demand by the app.

## 6) Optional Assets
- `carousels/` for videos and posters
- `pdfs/` for local PDFs
- `profile-card-app/` (React) must be pre-built so that `profile-card-app/dist/` is present in the deployed artifact, or set up a separate build/deploy for that sub-app.

## 7) Healthcheck
Use `GET /health` for a lightweight health probe. It does not hit the DB.

## 8) Common Issues
- MySQL connectivity: ensure host/port/firewall and credentials are correct.
- Missing Google Books key: some API calls may rate-limit without it.
- `/profile_card` returns 503: build the Vite app locally so `dist` exists and commit it, or skip this route.

## 9) Verify
After deploy, open the Capsule URL and test:
- `/health` returns `{ "status": "ok" }`
- `/login` email flow with Gravatar
- `/home` shows carousels, `/api/books/search?q=Dune` returns JSON.
