-- Create shelves and shelf_books tables
CREATE TABLE IF NOT EXISTS shelves (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_user_name UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS shelf_books (
  id SERIAL PRIMARY KEY,
  shelf_id INT NOT NULL,
  book_id VARCHAR(64) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_shelf_book UNIQUE (shelf_id, book_id),
  CONSTRAINT fk_shelf_books_shelf FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
);

-- No explicit seed here; defaults are ensured per-user on login by the app (create_default_shelves).
