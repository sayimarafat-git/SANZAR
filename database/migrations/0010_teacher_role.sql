-- Add 'teacher' role to users.role CHECK constraint while preserving all rows and columns
PRAGMA defer_foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users_v2 (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','moderator','teacher','content_admin','admin','super_admin')),
  level_id TEXT,
  locale TEXT NOT NULL DEFAULT 'bn',
  profile_visibility TEXT NOT NULL DEFAULT 'public',
  photo_url TEXT,
  grp TEXT,
  institution TEXT,
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  birth_year INTEGER,
  settings_json TEXT NOT NULL DEFAULT '{}'
);

INSERT OR IGNORE INTO users_v2
  (uid, email, display_name, role, level_id, locale, profile_visibility, photo_url, grp, institution, blocked, created_at, last_seen_at, email_verified, updated_at, birth_year, settings_json)
SELECT
  uid, email, display_name, role, level_id, locale, profile_visibility, photo_url, grp, institution, blocked, created_at, last_seen_at, email_verified, updated_at, birth_year, settings_json
FROM users;

DROP TABLE users;
ALTER TABLE users_v2 RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS users_created_at ON users(created_at DESC);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0010_teacher_role', 0);
