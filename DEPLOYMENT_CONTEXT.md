# Deployment Context for Nethooks (Flask)

This document summarizes the project so another GPT/engineer has all the context needed to plan a Code Capsules deployment.

## App Summary
- Flask app in `app.py` serving templates from `templates/` and static assets from `static/`.
- Uses Google Books API and MySQL for user profiles and shelves.
- Optional React/Vite sub-app in `profile-card-app/` (served from `profile-card-app/dist` if built).

## Entrypoint and Server
- WSGI app: `app:app`
- Production command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 3 --timeout 120`
- Healthcheck: `GET /health` (no DB access)
- Port: read from `$PORT` (provided by Code Capsules)
- Python version: `runtime.txt` (e.g., `python-3.11.9`)

## Dependencies
- `requirements.txt` includes: Flask, Flask-Login, Flask-Caching, mysql-connector-python, requests, python-dotenv, gunicorn.

## Environment Variables (required)
- `SECRET_KEY` (Flask session secret)
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB`
- `GOOGLE_BOOKS_API_KEY` (recommended)

## Environment Variables (optional)
- `DEBUG` or `FLASK_DEBUG` → set to `1` for verbose logs
- `USE_SSL`, `SSL_CERT_PATH`, `SSL_KEY_PATH` → for local HTTPS only (not used on Capsules)

## Database Schema
- Users table (see README):
  - `id VARCHAR(64) PRIMARY KEY`, `name`, `email UNIQUE`, `avatar`, `created_at`
- Shelves tables (auto-created by app if missing):
  - `shelves(id, user_id, name, is_default, created_at)`
  - `shelf_books(id, shelf_id, book_id, added_at)`
- SQL seed files: `migrations/001_create_shelves.sql` (shelves), plus README SQL for `users`.

## Routes Overview
- Public: `/`, `/creator`, `/api/books/section/<section>`, `/api/books/search`, `/api/books/related`, `/carousels/<file>`, `/api/videos`, `/health`
- Auth required: `/profiles_page`, `/profiles`, `/profile_card`, `/my_library`, Shelves APIs (`/api/shelves*`), `/pdfs/<filename>`

## Static & Media
- CSS/JS under `static/`
- Carousel videos under `carousels/` (optional)
- PDFs under `pdfs/` (optional)

## React Sub-App
- `profile-card-app/` is a Vite project. On server, the Flask route serves files from `profile-card-app/dist`.
- Ensure `dist` exists in the deployment artifact (pre-build locally and commit or add a build step in CI/CD). If missing, `/profile_card` returns 503 with instructions.

## Known Caveats
- MySQL must be reachable from the Capsule. Provide external DB or a separate MySQL Capsule and use private networking if available.
- Google Books API quota—having an API key prevents quick exhaustion.
- Media directories (`carousels/`, `pdfs/`) should be committed or uploaded if needed; otherwise routes still work but may have empty lists/404s.

## Start/Build Summary
- Build: `pip install -r requirements.txt`
- Run: Procfile `web` command (Gunicorn) uses `$PORT`.
