-- Create shelves and shelf_books tables
CREATE TABLE IF NOT EXISTS shelves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_name (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shelf_books (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shelf_id INT NOT NULL,
  book_id VARCHAR(64) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_shelf_book (shelf_id, book_id),
  CONSTRAINT fk_shelf_books_shelf FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No explicit seed here; defaults are ensured per-user on login by the app (create_default_shelves).
