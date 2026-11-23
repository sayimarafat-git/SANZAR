-- Initial baseline schema for SANZAR
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'student',
  profile_visibility TEXT NOT NULL DEFAULT 'private',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_uid TEXT NOT NULL,
  role TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY (user_uid, role),
  FOREIGN KEY (user_uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  level TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_markdown TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_progress (
  id TEXT PRIMARY KEY,
  user_uid TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dictionary_entries (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  phonetic TEXT,
  translation TEXT NOT NULL,
  example TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_manifest (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  download_url TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_uid TEXT,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail_json TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
