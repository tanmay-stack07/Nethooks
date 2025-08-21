# Nethooks (Flask + Google Books)

A Netflix-style web UI for discovering and previewing books and manga using the Google Books API, with simple email login backed by Gravatar and MySQL for storing profiles.

## Features
- Flask backend with route endpoints in `app.py`
- Email-based login with Gravatar check (`/login`)
- Profile selection page (`/profiles_page`) with create/delete
- Home page with carousels for Manga, Fiction, Sci‑Fi, Philosophy, Comics
- Search overlay with dynamic results
- Book preview modal with links (Preview/Read, Info, Buy, Goodreads)
- Caching layer via `Flask-Caching`
- Environment-based configuration via `.env`

## Project Structure
- `app.py`: Flask app, routes, Google Books integration, MySQL usage
- `templates/`: Jinja templates (`index.html`, `profiles_page.html`, `home_page.html`, etc.)
- `static/`: CSS and JS assets (`static/style.css`, `static/js/script.js`, images)
- `requirements.txt`: Python dependencies
- `.gitignore`: excludes `.venv/`, `.env`, local media (videos, pdfs), caches
- `check_env.py`: quick script to confirm `.env` loads `GOOGLE_BOOKS_API_KEY`

## Prerequisites
- Python 3.10+
- MySQL database
- A Google Books API key

## Quick Start (Windows PowerShell)
1) Create and activate a virtual environment
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2) Install dependencies
```powershell
pip install -r requirements.txt
```

3) Configure environment
- Copy `.env.example` to `.env` and fill values.
- Ensure your MySQL database is reachable and schema created (see below).

4) Run the app
```powershell
# Optionally enable debug
$Env:FLASK_DEBUG="1"

python app.py
# or: flask --app app run
```
The app will start at http://127.0.0.1:5000 (HTTPS if `USE_SSL=1` and certs are provided).

## Environment Variables (.env)
See `.env.example` for a full list. Key variables:
- `SECRET_KEY`: Flask session secret
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB`
- `GOOGLE_BOOKS_API_KEY`: Google Books API key
- `DEBUG` or `FLASK_DEBUG`: set to `1` for verbose logs
- `USE_SSL`: set to `1` to serve HTTPS locally
- `SSL_CERT_PATH`, `SSL_KEY_PATH`: cert/key file paths if `USE_SSL=1`

## Database Setup
Create the database and `users` table. Example SQL:
```sql
CREATE DATABASE IF NOT EXISTS your_db_name CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE your_db_name;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,           -- gravatar hash-based id
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  avatar VARCHAR(512) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
Update `.env` with your database credentials.

## API/Routes Overview
- `GET /` → Landing page with intro → redirects to `/login`
- `GET|POST /login` → Email login; verifies Gravatar and creates/fetches user
- `GET /create_gravatar` → Helper page to set up Gravatar if missing
- `GET /profiles_page` → Profile selection (auth required)
- `GET /profiles` → JSON list of profiles
- `DELETE /delete_profile/<id>` → Delete a profile (auth required)
- `GET /home` → Main UI with carousels (auth required)
- `GET /api/books/section/<section>` → Curated + category fallback list
- `GET /api/books/search?q=...` → Search results
- `GET /api/books/related?title=&author=` → Related books
- `GET /pdfs/<filename>` → Local PDF if present, else graceful fallback
- `GET /health` → Healthcheck

## Notes on Google Books integration
- API key is optional but recommended for higher quota.
- We build smarter queries via `build_books_query()` in `app.py`.
- We prefer Google Reader links when items are free or previewable.

## Troubleshooting
- Use `python check_env.py` to ensure `.env` is loaded.
- If MySQL errors occur, verify host/port/user and that the `users` table exists.
- If covers don’t show, check network console for CORS or blocked content.
- Intro video and PDFs are ignored by git per `.gitignore`; place them locally in `static/videos/` and `pdfs/` respectively.

## Deploying / Running with HTTPS Locally
- Set `USE_SSL=1` and provide `SSL_CERT_PATH`/`SSL_KEY_PATH`.
- Self-signed certs are acceptable for local testing.

## License
This project is provided as-is; choose a license that fits your needs before making it public.
