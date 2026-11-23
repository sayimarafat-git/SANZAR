ALTER TABLE books ADD COLUMN cover_image TEXT;
ALTER TABLE books ADD COLUMN cover_ratio REAL;

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0006_book_thumbnails', 0);
