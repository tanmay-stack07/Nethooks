# GPT Handoff: Nethooks (Flask + Google Books)

Use this as the single source of truth to guide Code Capsules deployment.

## Project Summary
- Netflix-style UI for books/manga driven by Google Books API.
- Flask backend in `app.py`, MySQL for profiles/shelves, optional React/Vite sub-app (`profile-card-app/`).

## Tech Stack
- Python/Flask, Flask-Login, Flask-Caching, requests, mysql-connector-python, python-dotenv
- Gunicorn for production WSGI
- Optional: Vite/React under `profile-card-app/` (served from `dist/`)

## Entrypoint & Server
- WSGI app: `app:app` (in `app.py`)
- Procfile: `web: gunicorn app:app --bind 0.0.0.0:$PORT --workers 3 --timeout 120`
- Python version: `runtime.txt` (e.g., `python-3.11.9`)
- Healthcheck: `GET /health` (no DB access)
- Port: use `$PORT`

## Build/Run
- Build: `pip install -r requirements.txt`
- Run (prod): via Procfile (Gunicorn)

## Env Vars (required)
- SECRET_KEY
- MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
- GOOGLE_BOOKS_API_KEY (recommended)
- Optional for debug: DEBUG=1 or FLASK_DEBUG=1

Refer to `.env.example` for a full list and defaults.

## Database
- Users table migration: `migrations/000_create_users.sql`
- Shelves tables are auto-created on demand by the app (`create_default_shelves()` in `app.py`).

## Key Routes
- Public: `/`, `/creator`, `/api/books/section/<section>`, `/api/books/search`, `/api/books/related`, `/carousels/<file>`, `/api/videos`, `/health`
- Auth: `/login`, `/profiles_page`, `/profiles`, `/profile_card`, `/my_library`, `/api/shelves*`, `/pdfs/<filename>`

## Static & Media
- Static CSS/JS/images: `static/`
- Optional media: `carousels/` for videos, `pdfs/` for local PDFs

## React Sub-app (optional)
- `profile-card-app/` is a Vite project. Flask serves from `profile-card-app/dist`.
- Build locally and ensure `dist/` is present in the repo if you want `/profile_card` to work in deployment.

## Repository Files Relevant to Deployment
- `app.py`, `requirements.txt`, `Procfile`, `runtime.txt`
- `README.md`, `DEPLOYMENT_CONTEXT.md`, `DEPLOY.md`
- `.env.example`
- `templates/`, `static/`
- `migrations/000_create_users.sql`, `migrations/001_create_shelves.sql`

## Code Capsules Deployment (high level)
1) Create a Python Web Service Capsule from this GitHub repo/branch.
2) Build command: `pip install -r requirements.txt`
3) Start command: leave empty (Procfile auto-detected) or set the same as Procfile.
4) Add env vars: SECRET_KEY, MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB, GOOGLE_BOOKS_API_KEY.
5) Ensure MySQL is reachable; run `migrations/000_create_users.sql` on the DB (shelves auto-create).
6) Deploy. Validate `GET /health`.

## Post-Deploy Validation
- `/health` -> `{ "status": "ok" }`
- `/login` email flow; Gravatar check
- `/home` loads carousels; `/api/books/search?q=Dune` returns JSON
- If `/profile_card` 503, build and commit `profile-card-app/dist`.

## GitHub Push (example commands)
```bash
# From the project root
git init
git add .
git commit -m "Prepare for Code Capsules deployment"
# Replace with your repo URL
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

## Notes / Hardening already applied
- Gunicorn added to `requirements.txt`.
- Procfile and runtime.txt added.
- Filesystem cache directory ensured on startup (`CACHE_DIR=cache`).
- Lightweight `/health` endpoint that avoids DB access.

## Known Caveats
- External MySQL connectivity/firewall must allow the Capsule.
- Google Books API key helps avoid quota issues.
- Media directories are optional; routes handle missing files gracefully.
