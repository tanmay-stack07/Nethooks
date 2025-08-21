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
import mysql.connector
from dotenv import load_dotenv
logger.debug("Imports loaded")

# Load environment variables
load_dotenv()
logger.debug(".env file loaded")

if logger.isEnabledFor(logging.DEBUG):
    logger.debug("Loading environment variables")
    logger.debug("SECRET_KEY: %s", 'Loaded' if os.getenv('SECRET_KEY') else 'Not Loaded')
    logger.debug("MYSQL_HOST: %s", os.getenv('MYSQL_HOST'))
    logger.debug("MYSQL_USER: %s", os.getenv('MYSQL_USER'))
    logger.debug("MYSQL_DB: %s", os.getenv('MYSQL_DB'))
    logger.debug("GOOGLE_BOOKS_API_KEY: %s", 'Loaded' if os.getenv('GOOGLE_BOOKS_API_KEY') else 'Not Loaded')

# App initialization
app = Flask(__name__)
logger.debug("Flask app initialized")

# --- Caching Configuration ---
app.config['CACHE_TYPE'] = 'filesystem'
app.config['CACHE_DIR'] = 'cache'
cache = Cache(app)
logger.debug("Cache configured")

# --- Configuration ---
logger.debug("Configuring app from env")
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config['MYSQL_HOST'] = os.getenv('MYSQL_HOST')
try:
    app.config['MYSQL_PORT'] = int(os.getenv('MYSQL_PORT'))
except (ValueError, TypeError):
    logger.warning("MYSQL_PORT is not a valid integer or is not set. Defaulting to 3306.")
    app.config['MYSQL_PORT'] = 3306
app.config['MYSQL_USER'] = os.getenv('MYSQL_USER')
app.config['MYSQL_PASSWORD'] = os.getenv('MYSQL_PASSWORD')
app.config['MYSQL_DB'] = os.getenv('MYSQL_DB')
logger.debug("App configured from env")

# Prefer https URLs when SSL is enabled
if os.getenv('USE_SSL') == '1':
    app.config['PREFERRED_URL_SCHEME'] = 'https'

# --- Google Books API ---
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")

# --- Database Connection ---
def get_db_connection():
    return mysql.connector.connect(
        host=app.config['MYSQL_HOST'], port=app.config['MYSQL_PORT'],
        user=app.config['MYSQL_USER'], password=app.config['MYSQL_PASSWORD'],
        database=app.config['MYSQL_DB']
    )

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
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user_data = cursor.fetchone()
        cursor.close()
        conn.close()
        if user_data:
            return User(id=user_data['id'], name=user_data['name'], email=user_data['email'], avatar=user_data['avatar'])
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
    if current_user.is_authenticated:
        return redirect(url_for('profiles_page'))
    return render_template('index.html')

@app.route('/profiles_page')
@login_required
def profiles_page():
    return render_template('profiles_page.html')

@app.route('/home')
@login_required
def home():
    return render_template('home_page.html')

@app.route('/profiles')
@login_required
def get_profiles():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, name, avatar FROM users")
        profiles = cursor.fetchall()
        cursor.close()
        conn.close()
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

            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            try:
                # Look up by email first to avoid unique email conflicts with legacy IDs
                cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
                user_data = cursor.fetchone()
                if not user_data:
                    # Not found by email -> create new record with deterministic id
                    cursor.execute(
                        "INSERT INTO users (id, name, email, avatar) VALUES (%s, %s, %s, %s)",
                        (user_id, name, email, avatar_url)
                    )
                    conn.commit()
                    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
                    user_data = cursor.fetchone()
                    # New account path
                    flash("New account created! Signing you in...", "success")
                else:
                    # Optionally refresh avatar/name if changed
                    if (user_data.get('avatar') != avatar_url) or (user_data.get('name') != name):
                        try:
                            cursor.execute(
                                "UPDATE users SET name = %s, avatar = %s WHERE id = %s",
                                (name, avatar_url, user_data['id'])
                            )
                            conn.commit()
                            cursor.execute("SELECT * FROM users WHERE id = %s", (user_data['id'],))
                            user_data = cursor.fetchone()
                        except Exception:
                            # Non-fatal; proceed with existing data
                            pass
                    # Existing account path
                    flash("Welcome back! Signing you in...", "success")
            finally:
                cursor.close()
                conn.close()

            if user_data:
                user = User(id=user_data['id'], name=user_data['name'], email=user_data['email'], avatar=user_data['avatar'])
                login_user(user)
                # Persist email in session for convenience
                session['user_email'] = email
                return redirect(url_for('profiles_page'))

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

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM users WHERE id = %s", (profile_id,))
        conn.commit()
        if self_deleted:
            logout_user()
        return jsonify({'success': True, 'self_deleted': self_deleted})
    except mysql.connector.Error as e:
        logger.error("Database error: %s", e)
        return jsonify({'success': False, 'message': 'Database error'}), 500
    finally:
        cursor.close()
        conn.close()

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
        debug=os.getenv('FLASK_DEBUG') == '1' or os.getenv('DEBUG') == '1',
        ssl_context=ssl_context
    )