import os
import logging

# Configure logging early
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

import hashlib
import requests
import time
from flask import Flask, render_template, redirect, url_for, session, request, jsonify, send_from_directory, flash
from flask_caching import Cache
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
logger.debug("Imports loaded")

# Load environment variables
load_dotenv()
logger.debug(".env file loaded")

if logger.isEnabledFor(logging.DEBUG):
    logger.debug("Loading environment variables")
    logger.debug("SECRET_KEY: %s", 'Loaded' if os.getenv('SECRET_KEY') else 'Not Loaded')
    logger.debug("DATABASE_URL present: %s", bool(os.getenv('DATABASE_URL')))
    logger.debug("GOOGLE_BOOKS_API_KEY: %s", 'Loaded' if os.getenv('GOOGLE_BOOKS_API_KEY') else 'Not Loaded')

# App initialization
app = Flask(__name__)
logger.debug("Flask app initialized")

# --- Caching Configuration ---
app.config['CACHE_TYPE'] = 'filesystem'
app.config['CACHE_DIR'] = 'cache'
try:
    os.makedirs(app.config['CACHE_DIR'], exist_ok=True)
except Exception as e:
    logger.warning("Could not create cache dir '%s': %s", app.config['CACHE_DIR'], e)
cache = Cache(app)
logger.debug("Cache configured")

# --- Configuration ---
logger.debug("Configuring app from env")
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    logger.warning("DATABASE_URL is not set. Database operations will fail until it is configured.")
engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None
logger.debug("App configured from env")

# Prefer https URLs when SSL is enabled
if os.getenv('USE_SSL') == '1':
    app.config['PREFERRED_URL_SCHEME'] = 'https'

# --- Google Books API ---
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")

# --- Database Connection ---
def get_db_connection():
    if not engine:
        raise RuntimeError("DATABASE_URL not configured")
    return engine.connect()

# --- User Model and Login Manager ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
logger.debug("Login manager initialized")

class User(UserMixin):
    def __init__(self, id, name, email, avatar):
        self.id = id
        self.name = name
        self.email = email
        self.avatar = avatar

@login_manager.user_loader
def load_user(user_id):
    try:
        with get_db_connection() as conn:
            res = conn.execute(text("SELECT id, name, email, avatar FROM users WHERE id = :id"), {"id": user_id})
            row = res.mappings().fetchone()
        if row:
            return User(id=row['id'], name=row['name'], email=row['email'], avatar=row['avatar'])
    except Exception as e:
        # On DB failure, log and treat as not authenticated instead of 500
        logger.error("load_user DB error: %s", e)
    return None

# --- Helper Functions ---

@cache.memoize(timeout=3600)  # Cache for 1 hour; keys by function args (api_url)
def fetch_api_data(api_url):
    """Cached function to fetch data from a given API URL."""
    try:
        logger.debug("[API_FETCH] Fetching: %s", api_url)
        r = requests.get(api_url, timeout=10)
        r.raise_for_status() # Raises an HTTPError for bad responses (4xx or 5xx)
        return r.json()
    except requests.exceptions.HTTPError as e:
        logger.error("[API_FETCH_ERROR] HTTP Error: %s for URL: %s", e.response.status_code, api_url)
        logger.error("[API_FETCH_ERROR] Response Body: %s", e.response.text)
        return None
    except requests.exceptions.ConnectionError as e:
        logger.error("[API_FETCH_ERROR] Connection Error: %s for URL: %s", e, api_url)
        return None
    except requests.exceptions.Timeout as e:
        logger.error("[API_FETCH_ERROR] Timeout Error: %s for URL: %s", e, api_url)
        return None
    except requests.exceptions.RequestException as e:
        logger.error("[API_FETCH_ERROR] General Request Error: %s for URL: %s", e, api_url)
        return None
    except Exception as e:
        logger.error("[API_FETCH_ERROR] An unexpected error occurred: %s", e)
        return None

def get_book_data(item):
    """Parse essential book data from a Google Books API response item."""
    volume_info = item.get('volumeInfo', {})
    sale_info = item.get('saleInfo', {})
    access_info = item.get('accessInfo', {})

    # Best available cover image
    image_links = volume_info.get('imageLinks', {})
    cover_url = (
        image_links.get('extraLarge')
        or image_links.get('large')
        or image_links.get('medium')
        or image_links.get('small')
        or image_links.get('thumbnail')
        or image_links.get('smallThumbnail')
        or None
    )

    # Authors
    authors = volume_info.get('authors', ['Unknown Author'])
    if not isinstance(authors, list):
        authors = [str(authors)]

    categories = volume_info.get('categories') or []

    # Determine if book is free or paid
    saleability = sale_info.get('saleability', 'NOT_FOR_SALE')
    is_free = saleability == 'FREE' or access_info.get('viewability') == 'ALL_PAGES'
    
    # Get best available preview link
    # If book is free or fully viewable, prioritize the direct Reader URL format
    # https://play.google.com/books/reader?id=<VOLUME_ID>
    vol_id = item.get('id')
    if vol_id and (is_free or (access_info.get('viewability') and access_info.get('viewability') != 'NO_PAGES')):
        preview_link = f"https://play.google.com/books/reader?id={vol_id}"
    else:
        # Otherwise prefer previewLink over webReaderLink for reliability
        preview_link = (
            volume_info.get('previewLink') or
            access_info.get('webReaderLink') or 
            volume_info.get('canonicalVolumeLink')
        )
    
    # Enhanced book data with free/paid status
    return {
        'id': item.get('id'),
        'title': volume_info.get('title', 'Untitled'),
        'author': ", ".join(authors),
        'cover': cover_url,
        'description': volume_info.get('description', 'No description available.'),
        'buy_link': sale_info.get('buyLink', '#'),
        'info_link': volume_info.get('infoLink') or item.get('selfLink'),
        'preview_link': preview_link,
        'pdf_link': f"/pdfs/{item.get('id')}.pdf",
        'publishedDate': volume_info.get('publishedDate'),
        'categories': categories,
        'pageCount': volume_info.get('pageCount'),
        'language': volume_info.get('language'),
        'publisher': volume_info.get('publisher'),
        'saleability': saleability,
        'is_free': is_free,
        'viewability': access_info.get('viewability', 'NO_PAGES'),
        'rating': volume_info.get('averageRating'),
        'ratingsCount': volume_info.get('ratingsCount')
    }

# ---- Shelves/Watchlist helpers ----
def create_default_shelves(user_id):
    """Ensure default shelves exist for a user: To Read, Currently Reading, Read"""
    try:
        defaults = ["To Read", "Currently Reading", "Read"]
        created = []
        with get_db_connection() as conn:
            for nm in defaults:
                try:
                    res = conn.execute(
                        text("""
                            INSERT INTO shelves (user_id, name, is_default)
                            VALUES (:uid, :name, TRUE)
                            ON CONFLICT (user_id, name) DO NOTHING
                        """),
                        {"uid": user_id, "name": nm}
                    )
                    if res.rowcount:
                        created.append(nm)
                except Exception:
                    pass
        logger.debug("Default shelves ensured for %s: %s", user_id, created)
    except Exception as e:
        logger.error("create_default_shelves error: %s", e)

def get_shelf_by_name(user_id, name):
    with get_db_connection() as conn:
        res = conn.execute(text("SELECT id, user_id, name, is_default, created_at FROM shelves WHERE user_id = :uid AND name = :name"), {"uid": user_id, "name": name})
        row = res.mappings().fetchone()
        return dict(row) if row else None

def fetch_book_by_id(volume_id):
    try:
        api_url = f"https://www.googleapis.com/books/v1/volumes/{requests.utils.quote(volume_id)}?projection=full"
        if GOOGLE_BOOKS_API_KEY:
            api_url += f"&key={GOOGLE_BOOKS_API_KEY}"
        data = fetch_api_data(api_url)
        if not data:
            return None
        return get_book_data(data)
    except Exception as e:
        logger.error("fetch_book_by_id error: %s", e)
        return None

def build_books_query(raw_query: str):
    """Build an optimized Google Books API query string from a user query.
    Rules:
    - If the user already provides field modifiers (intitle:, inauthor:, isbn:, subject:), pass through.
    - If the query looks like an ISBN (10/13 digits, possibly with hyphens), use isbn: modifier.
    - If the query matches "<title> by <author>" or "<title>, <author>", map to intitle:+inauthor: with quotes.
    - Otherwise search in title primarily and fall back to general terms.
    Returns: (q_string, extra_params_dict)
    """
    q = (raw_query or '').strip()
    params = {
        'q': q,
        'maxResults': '40',
        'projection': 'full',  # we need description and metadata
        'orderBy': 'newest',   # prioritize newest books
        'printType': 'books'   # only books, no magazines
    }

    # If user already uses fielded search, trust it
    lowered = q.lower()
    if any(tok in lowered for tok in ('intitle:', 'inauthor:', 'isbn:', 'subject:')):
        return q, params

    # Detect ISBN-10/13 (allow hyphens/spaces)
    digits = ''.join(ch for ch in q if ch.isdigit() or ch.upper() == 'X')
    if len(digits) in (10, 13) and (digits[:-1].isdigit() and (digits[-1].isdigit() or digits[-1].upper() == 'X')):
        return f"isbn:{digits}", params

    # Try to split patterns: "Title by Author" or "Title, Author"
    import re
    m = re.match(r'\s*"?(.+?)"?\s+by\s+"?(.+?)"?\s*$', q, flags=re.IGNORECASE)
    if m:
        title = m.group(1).strip()
        author = m.group(2).strip()
        return f'intitle:"{title}"+inauthor:"{author}"', params

    m2 = re.match(r'\s*"?(.+?)"?\s*,\s*"?(.+?)"?\s*$', q)
    if m2:
        title = m2.group(1).strip()
        author = m2.group(2).strip()
        return f'intitle:"{title}"+inauthor:"{author}"', params

    # Default: prefer title search but include raw as fallback term
    return f'intitle:"{q}"+{q}', params

# --- Routes ---
@app.route('/')
def index():
    # Serve the intro/landing page (video)
    return render_template('index.html')

@app.route('/profiles_page')
@login_required
def profiles_page():
    return render_template('profiles_page.html')

@app.route('/profile_card')
@login_required
def profile_card():
    # Serve the built React app (Vite) from profile-card-app/dist
    dist_dir = os.path.join(app.root_path, 'profile-card-app', 'dist')
    index_path = os.path.join(dist_dir, 'index.html')
    if not os.path.exists(index_path):
        # Provide a friendly message if not built yet
        return ("Profile app not built. Please run 'npm install' and 'npm run build' in profile-card-app/", 503)
    # We don't need to inject data server-side; the React app reads query params
    return send_from_directory(dist_dir, 'index.html')

@app.route('/profile_card/<path:filename>')
@login_required
def profile_card_assets(filename):
    # Serve static assets for the React app under /profile_card/
    dist_dir = os.path.join(app.root_path, 'profile-card-app', 'dist')
    return send_from_directory(dist_dir, filename)

@app.route('/home')
def home():
    # Serve the main homepage directly
    return render_template('home_page.html')

@app.route('/creator')
def creator():
    """Public page showing the site's creator info."""
    return render_template('creator.html')

@app.route('/favicon.ico')
def favicon():
    """Serve favicon from the static directory to satisfy /favicon.ico requests."""
    return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/profiles')
@login_required
def get_profiles():
    try:
        with get_db_connection() as conn:
            res = conn.execute(text("SELECT id, name, avatar FROM users"))
            profiles = [dict(r) for r in res.mappings().all()]
        logger.debug("Fetched profiles: %s", profiles)
        return jsonify(profiles)
    except Exception as e:
        logger.exception("Error fetching profiles: %s", e)
        return jsonify({'error': str(e)}), 500

# --- Curated Book Lists & API Query Maps ---
curated = {
    'manga': [
        ("Vinland Saga", "Makoto Yukimura"),
        ("Naruto", "Masashi Kishimoto"),
        ("One Piece", "Eiichiro Oda"),
        ("Boruto: Naruto Next Generations", "Ukyō Kodachi"),
        ("Berserk", "Kentaro Miura"),
        ("My Hero Academia", "Kohei Horikoshi"),
        ("Demon Slayer", "Koyoharu Gotouge"),
    ],
    'fiction': [
        ("To Kill a Mockingbird", "Harper Lee"),
        ("The Great Gatsby", "F. Scott Fitzgerald"),
        ("Pride and Prejudice", "Jane Austen"),
        ("1984", "George Orwell"),
        ("The Catcher in the Rye", "J.D. Salinger"),
    ],
    'scifi': [
        ("Dune", "Frank Herbert"),
        ("Foundation", "Isaac Asimov"),
        ("Neuromancer", "William Gibson"),
        ("Ender's Game", "Orson Scott Card"),
        ("The Martian", "Andy Weir"),
    ],
    'philosophy': [
        ("Meditations", "Marcus Aurelius"),
        ("Letters from a Stoic", "Seneca"),
        ("The Republic", "Plato"),
        ("Nicomachean Ethics", "Aristotle"),
        ("Thus Spoke Zarathustra", "Friedrich Nietzsche"),
        ("Discourses and Selected Writings", "Epictetus"),
    ],
    'comics': [
        ("The Avengers", "Stan Lee"),
        ("The Amazing Spider-Man", "Stan Lee"),
        ("Batman: The Dark Knight Returns", "Frank Miller"),
        ("Watchmen", "Alan Moore"),
        ("Saga", "Brian K. Vaughan"),
        ("Paper Girls", "Brian K. Vaughan"),
    ],
}

query_map = {
    'manga': 'q=(subject:manga OR subject:"graphic novels" OR "manga")&orderBy=relevance&maxResults=40&printType=books',
    'fiction': 'q=subject:fiction&orderBy=relevance&maxResults=40&printType=books',
    'scifi': 'q=(subject:"science fiction" OR "sci-fi" OR "scifi")&orderBy=relevance&maxResults=40&printType=books',
    'philosophy': 'q=subject:philosophy&orderBy=relevance&maxResults=40&printType=books',
    'fantasy': 'q=subject:fantasy&orderBy=relevance&maxResults=40&printType=books',
    'comics': 'q=(subject:comics OR subject:"graphic novels")&orderBy=relevance&maxResults=40&printType=books',
}

# --- Public API endpoints for dynamic books ---
@app.route('/api/books/section/<section_name>')
def get_books_by_section(section_name):
    try:
        limit = int(request.args.get('limit', 12))
    except ValueError:
        limit = 12

    books = []

    # Step 1: Search for specific, curated titles first
    if section_name in curated:
        for title, author in curated[section_name]:
            if len(books) >= limit:
                break
            # light rate limiting to be polite to the API
            time.sleep(0.3)
            query = f'intitle:"{title}" inauthor:"{author}"'
            api_url = f"https://www.googleapis.com/books/v1/volumes?q={requests.utils.quote(query)}&maxResults=5&orderBy=relevance&projection=full"
            if GOOGLE_BOOKS_API_KEY:
                api_url += f"&key={GOOGLE_BOOKS_API_KEY}"
            data = fetch_api_data(api_url)
            if data and data.get('items'):
                for item in data.get('items', []):
                    book = get_book_data(item)
                    # Require cover and avoid duplicates by id
                    if book.get('cover') and book['id'] not in [b['id'] for b in books]:
                        books.append(book)
                        break

    # Step 2: If not enough books, fall back to a broader category search
    if len(books) < limit:
        query = query_map.get(section_name)
        if query:
            api_url = f"https://www.googleapis.com/books/v1/volumes?{query}&projection=full"
            if GOOGLE_BOOKS_API_KEY:
                api_url += f"&key={GOOGLE_BOOKS_API_KEY}"
            data = fetch_api_data(api_url)
            if data and data.get('items'):
                raw_books = [get_book_data(item) for item in data.get('items', [])]
                # Filter for books with covers and no duplicates
                fallback_books = [b for b in raw_books if b.get('cover') and b['id'] not in [bk['id'] for bk in books]]
                books.extend(fallback_books)

    return jsonify(books[:limit])

# --- Related / Next parts endpoint ---
@app.route('/api/books/related')
def related_books():
    title = request.args.get('title', '').strip()
    author = request.args.get('author', '').strip()
    if not (title or author):
        return jsonify([])

    # Build a query that prioritizes same author and similar title tokens
    tokens = "+".join([t for t in title.split()[:3] if t.isalpha()]) if title else ''
    query_parts = []
    if author:
        query_parts.append(f"inauthor:{requests.utils.quote(author)}")
    if tokens:
        query_parts.append(f"intitle:{requests.utils.quote(tokens)}")
    query = "+".join(query_parts) or requests.utils.quote(title or author)

    api_url = (
        f"https://www.googleapis.com/books/v1/volumes?q={query}&maxResults=20&orderBy=relevance"
        + (f"&key={GOOGLE_BOOKS_API_KEY}" if GOOGLE_BOOKS_API_KEY else "")
    )
    
    data = fetch_api_data(api_url)
    if data:
        books = [get_book_data(item) for item in data.get('items', [])]
        books = [b for b in books if b.get('cover')]
        return jsonify(books)
    else:
        # Gracefully fail by returning an empty list
        logger.info("[related] API error, returning empty list.")
        return jsonify([])

@app.route('/api/books/search')
def search_books():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])
    
    logger.debug("[search] Query: %s", query)
    
    q_string, extra = build_books_query(query)
    base = f"https://www.googleapis.com/books/v1/volumes?q={requests.utils.quote(q_string)}"
    api_url = base
    for k, v in extra.items():
        if k != 'q': # q is already in the base
            api_url += f"&{k}={v}"
    if GOOGLE_BOOKS_API_KEY:
        api_url += f"&key={GOOGLE_BOOKS_API_KEY}"
    
    data = fetch_api_data(api_url)
    if not data:
        logger.info("[search] API error, returning empty list.")
        return jsonify([])

    logger.debug("[search] Total items found: %s", data.get('totalItems', 0))
    items = data.get('items', [])
    if not items:
        return jsonify([])
        
    books = []
    for item in items:
        try:
            book = get_book_data(item)
            if book.get('cover'):
                books.append(book)
        except Exception as e:
            logger.exception("[search] Error processing book item: %s", e)
            continue
            
    logger.debug("[search] Returning %d books", len(books))
    return jsonify(books)

@app.route('/api/test')
def test_api():
    """Test endpoint to verify API connectivity"""
    try:
        test_url = f"https://www.googleapis.com/books/v1/volumes?q=test&maxResults=1&key={GOOGLE_BOOKS_API_KEY}"
        resp = requests.get(test_url, timeout=10)
        return jsonify({
            'status': resp.status_code,
            'api_key_present': bool(GOOGLE_BOOKS_API_KEY),
            'response': resp.json() if resp.status_code == 200 else resp.text
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route("/login", methods=['GET', 'POST'])
def login():
    """Custom email-based login. On POST, checks Gravatar and stores user in DB."""
    if request.method == 'POST':
        email = (request.form.get('email') or '').strip()
        if email:
            # Check for Gravatar existence (with timeout and 404 handling)
            avatar_hash = hashlib.md5(email.lower().encode('utf-8')).hexdigest()
            gravatar_probe = f"https://www.gravatar.com/avatar/{avatar_hash}?d=404"
            try:
                resp = requests.get(gravatar_probe, timeout=5)
                has_gravatar = (resp.status_code == 200)
            except requests.exceptions.RequestException:
                has_gravatar = False

            if not has_gravatar:
                # Redirect user to create a Gravatar, store their email temporarily
                session['user_email_for_gravatar'] = email
                flash("No Gravatar found for this email. Please create one to continue.", "info")
                return redirect(url_for('create_gravatar_page'))

            # If Gravatar exists, create or fetch the user from DB
            user_id = avatar_hash  # deterministic id based on email
            name = email.split('@')[0]
            avatar_url = f"https://www.gravatar.com/avatar/{avatar_hash}?d=identicon&s=150"

            with get_db_connection() as conn:
                with conn.begin():
                    # Look up by email first to avoid unique email conflicts with legacy IDs
                    res = conn.execute(text("SELECT id, name, email, avatar FROM users WHERE email = :email"), {"email": email})
                    row = res.mappings().fetchone()
                    user_data = dict(row) if row else None
                    if not user_data:
                        # Not found by email -> create new record with deterministic id
                        conn.execute(
                            text("""
                                INSERT INTO users (id, name, email, avatar)
                                VALUES (:id, :name, :email, :avatar)
                                ON CONFLICT (id) DO NOTHING
                            """),
                            {"id": user_id, "name": name, "email": email, "avatar": avatar_url}
                        )
                        # Fetch the created (or existing by unique email) record
                        res2 = conn.execute(text("SELECT id, name, email, avatar FROM users WHERE email = :email"), {"email": email})
                        row2 = res2.mappings().fetchone()
                        user_data = dict(row2) if row2 else None
                        # New account path
                        flash("New account created! Signing you in...", "success")
                    else:
                        # Optionally refresh avatar/name if changed
                        if (user_data.get('avatar') != avatar_url) or (user_data.get('name') != name):
                            try:
                                conn.execute(
                                    text("UPDATE users SET name = :name, avatar = :avatar WHERE id = :id"),
                                    {"name": name, "avatar": avatar_url, "id": user_data['id']}
                                )
                                res3 = conn.execute(text("SELECT id, name, email, avatar FROM users WHERE id = :id"), {"id": user_data['id']})
                                row3 = res3.mappings().fetchone()
                                user_data = dict(row3) if row3 else user_data
                            except Exception:
                                # Non-fatal; proceed with existing data
                                pass
                        # Existing account path
                        flash("Welcome back! Signing you in...", "success")

            if user_data:
                user = User(id=user_data['id'], name=user_data['name'], email=user_data['email'], avatar=user_data['avatar'])
                login_user(user)
                # Persist email in session for convenience
                session['user_email'] = email
                # Ensure default shelves for this user
                try:
                    create_default_shelves(user.id)
                except Exception:
                    pass
                return redirect(url_for('home'))

    # GET or fallthrough renders the email login form
    return render_template('login_email.html')

## OAuth callback route removed in favor of email-based login

@app.route('/create_gravatar')
def create_gravatar_page():
    user_email = session.get('user_email_for_gravatar')
    if not user_email:
        return redirect(url_for('login'))
    return render_template("create_gravatar.html", user_email=user_email)

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

@app.route('/delete_profile/<profile_id>', methods=['DELETE'])
@login_required
def delete_profile(profile_id):
    self_deleted = (profile_id == current_user.id)

    with get_db_connection() as conn:
        try:
            conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": profile_id})
            if self_deleted:
                logout_user()
            return jsonify({'success': True, 'self_deleted': self_deleted})
        except Exception as e:
            logger.error("Database error: %s", e)
            return jsonify({'success': False, 'message': 'Database error'}), 500

@app.route('/pdfs/<filename>')
@login_required
def serve_pdf(filename):
    pdf_path = os.path.join(app.root_path, 'pdfs', filename)
    if os.path.exists(pdf_path):
        return send_from_directory('pdfs', filename)
    else:
        # If the local PDF is not found, redirect to the Google Books preview as a fallback
        fallback_url = request.args.get('fallback')
        if fallback_url:
            return redirect(fallback_url)
        else:
            # If no fallback is provided, show the not found page
            return render_template('pdf_not_found.html', filename=filename), 404

# --- Video static serving and listing ---
@app.route('/carousels/<path:filename>')
def serve_video(filename):
    """Serve video files from the carousels directory."""
    videos_dir = os.path.join(app.root_path, 'carousels')
    return send_from_directory(videos_dir, filename)

@app.route('/api/videos')
def list_videos():
    """Return a list of available videos from the carousels directory."""
    videos_dir = os.path.join(app.root_path, 'carousels')
    exts = {'.mp4', '.webm', '.ogg'}
    items = []
    try:
        if os.path.isdir(videos_dir):
            for name in sorted(os.listdir(videos_dir)):
                _, ext = os.path.splitext(name)
                if ext.lower() in exts:
                    stem = os.path.splitext(name)[0]
                    poster = None
                    # Poster image with same stem (jpg/png/webp)
                    for pext in ('.jpg', '.jpeg', '.png', '.webp'):
                        cand = f"{stem}{pext}"
                        if os.path.exists(os.path.join(videos_dir, cand)):
                            poster = url_for('serve_video', filename=cand)
                            break
                    items.append({
                        'filename': name,
                        'url': url_for('serve_video', filename=name),
                        'poster': poster,
                        'title': stem.replace('_', ' ').title()
                    })
    except Exception as e:
        logger.error('Error listing videos: %s', e)
    return jsonify(items)

# ---- My Library page ----
@app.route('/my_library')
@login_required
def my_library():
    return render_template('my_library.html')

# ---- Shelves API ----
@app.route('/api/shelves/defaults', methods=['POST'])
@login_required
def api_ensure_defaults():
    create_default_shelves(current_user.id)
    return jsonify({'ok': True})

@app.route('/api/shelves', methods=['GET', 'POST'])
@login_required
def api_shelves():
    if request.method == 'GET':
        with get_db_connection() as conn:
            res = conn.execute(text("""
                SELECT id, name, is_default
                FROM shelves
                WHERE user_id = :uid
                ORDER BY is_default DESC, name
            """), {"uid": current_user.id})
            return jsonify([dict(r) for r in res.mappings().all()])
    else:
        name = (request.json or {}).get('name', '').strip()
        if not name:
            return jsonify({'error': 'name required'}), 400
        with get_db_connection() as conn:
            try:
                res = conn.execute(text(
                    """
                    INSERT INTO shelves (user_id, name, is_default)
                    VALUES (:uid, :name, FALSE)
                    RETURNING id
                    """
                ), {"uid": current_user.id, "name": name})
                new_id = res.scalar()
                return jsonify({'id': new_id, 'name': name, 'is_default': False}), 201
            except Exception as e:
                return jsonify({'error': str(e)}), 400

@app.route('/api/shelves/<int:shelf_id>', methods=['PATCH', 'DELETE'])
@login_required
def api_shelf_modify(shelf_id):
    with get_db_connection() as conn:
        res = conn.execute(text("SELECT id, user_id, name, is_default FROM shelves WHERE id = :id AND user_id = :uid"), {"id": shelf_id, "uid": current_user.id})
        shelf = res.mappings().fetchone()
        if not shelf:
            return jsonify({'error': 'not found'}), 404
        if request.method == 'PATCH':
            if shelf.get('is_default') if isinstance(shelf, dict) else shelf['is_default']:
                return jsonify({'error': 'cannot rename default shelf'}), 400
            name = (request.json or {}).get('name', '').strip()
            if not name:
                return jsonify({'error': 'name required'}), 400
            conn.execute(text("UPDATE shelves SET name = :name WHERE id = :id"), {"name": name, "id": shelf_id})
            return jsonify({'ok': True})
        else:
            if shelf.get('is_default') if isinstance(shelf, dict) else shelf['is_default']:
                return jsonify({'error': 'cannot delete default shelf'}), 400
            conn.execute(text("DELETE FROM shelves WHERE id = :id"), {"id": shelf_id})
            return jsonify({'ok': True})

@app.route('/api/shelves/<int:shelf_id>/books', methods=['GET', 'POST'])
@login_required
def api_shelf_books(shelf_id):
    with get_db_connection() as conn:
        # Ownership check
        res = conn.execute(text("SELECT id FROM shelves WHERE id = :id AND user_id = :uid"), {"id": shelf_id, "uid": current_user.id})
        shelf = res.fetchone()
        if not shelf:
            return jsonify({'error': 'not found'}), 404

        if request.method == 'GET':
            limit = int(request.args.get('limit', 40))
            res2 = conn.execute(text("""
                SELECT book_id FROM shelf_books
                WHERE shelf_id = :sid
                ORDER BY added_at DESC
                LIMIT :lim
            """), {"sid": shelf_id, "lim": limit})
            ids = [row[0] for row in res2.fetchall()]
            books = []
            for vid in ids:
                b = fetch_book_by_id(vid)
                if b and b.get('cover'):
                    books.append(b)
            return jsonify(books)
        else:
            book_id = (request.json or {}).get('book_id', '').strip()
            if not book_id:
                return jsonify({'error': 'book_id required'}), 400
            try:
                res3 = conn.execute(text(
                    """
                    INSERT INTO shelf_books (shelf_id, book_id)
                    VALUES (:sid, :bid)
                    ON CONFLICT (shelf_id, book_id) DO NOTHING
                    """
                ), {"sid": shelf_id, "bid": book_id})
                return jsonify({'ok': True, 'added': res3.rowcount > 0})
            except Exception as e:
                return jsonify({'error': str(e)}), 400

@app.route('/api/shelves/<int:shelf_id>/books/<book_id>', methods=['DELETE'])
@login_required
def api_shelf_book_delete(shelf_id, book_id):
    with get_db_connection() as conn:
        # Ownership check
        res = conn.execute(text("SELECT 1 FROM shelves WHERE id = :id AND user_id = :uid"), {"id": shelf_id, "uid": current_user.id})
        if not res.fetchone():
            return jsonify({'error': 'not found'}), 404
        conn.execute(text("DELETE FROM shelf_books WHERE shelf_id = :sid AND book_id = :bid"), {"sid": shelf_id, "bid": book_id})
        return jsonify({'ok': True})

@app.route('/api/mylist/add', methods=['POST'])
@login_required
def api_mylist_add():
    body = request.get_json(silent=True) or {}
    book_id = (body.get('book_id') or '').strip()
    if not book_id:
        return jsonify({'error': 'book_id required'}), 400
    create_default_shelves(current_user.id)
    # Get To Read shelf
    shelf = get_shelf_by_name(current_user.id, 'To Read')
    if not shelf:
        return jsonify({'error': 'default shelf missing'}), 500
    with get_db_connection() as conn:
        res = conn.execute(text(
            """
            INSERT INTO shelf_books (shelf_id, book_id)
            VALUES (:sid, :bid)
            ON CONFLICT (shelf_id, book_id) DO NOTHING
            """
        ), {"sid": shelf['id'], "bid": book_id})
        added = res.rowcount > 0
        return jsonify({'ok': True, 'shelf_id': shelf['id'], 'added': added})

# Lightweight health endpoint that avoids DB access
@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'debug': bool(os.getenv('FLASK_DEBUG') == '1' or os.getenv('DEBUG') == '1')
    })

if __name__ == "__main__":
    # Elevate to DEBUG if env indicates
    if os.getenv('FLASK_DEBUG') == '1' or os.getenv('DEBUG') == '1':
        logger.setLevel(logging.DEBUG)
    use_ssl = os.getenv('USE_SSL') == '1'
    ssl_context = None
    if use_ssl:
        cert_path = os.getenv('SSL_CERT_PATH', 'cert.pem')
        key_path = os.getenv('SSL_KEY_PATH', 'key.pem')
        ssl_context = (cert_path, key_path)
        logger.info("Starting Flask with HTTPS using cert=%s key=%s", cert_path, key_path)
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=os.getenv('FLASK_DEBUG') == '1' or os.getenv('DEBUG') == '1',
        ssl_context=ssl_context
    )