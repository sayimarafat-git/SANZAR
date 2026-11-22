CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'moderator', 'content_admin', 'admin', 'super_admin')),
  level_id TEXT,
  locale TEXT NOT NULL DEFAULT 'bn',
  profile_visibility TEXT NOT NULL DEFAULT 'public',
  photo_url TEXT,
  grp TEXT,
  institution TEXT,
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS users_created_at ON users(created_at DESC);
