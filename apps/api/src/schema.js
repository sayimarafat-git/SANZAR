/**
 * D1 (SQLite) schema migrations. Applied in order by the Worker on demand
 * (POST /v1/admin/migrate, super_admin) and recorded in schema_migrations.
 * Never edit a released migration — add a new one.
 */
export const MIGRATIONS = [
  {
    id: '0001_init',
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);

-- ---------- People ----------
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','moderator','content_admin','admin','super_admin')),
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
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS users_created_at ON users(created_at DESC);

-- ---------- Catalog ----------
CREATE TABLE IF NOT EXISTS levels (id TEXT PRIMARY KEY, name_en TEXT NOT NULL, name_bn TEXT, name_zh TEXT, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, name_en TEXT NOT NULL, name_bn TEXT, name_zh TEXT, icon TEXT, color TEXT, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  edition TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  cover_c1 TEXT NOT NULL DEFAULT '#2b2fd1',
  cover_c2 TEXT NOT NULL DEFAULT '#7a3ff0',
  featured_rank INTEGER,
  sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS book_levels (book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, level_id TEXT NOT NULL, PRIMARY KEY (book_id, level_id));
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, sort);

-- Reusable video assets (one video can serve several chapters).
CREATE TABLE IF NOT EXISTS video_assets (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('youtube','drive','url')),
  url TEXT NOT NULL,
  duration_sec INTEGER,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video','pdf','ppt','link')),
  title TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  video_asset_id TEXT REFERENCES video_assets(id),
  current_version INTEGER NOT NULL DEFAULT 1,
  pages INTEGER,
  licence TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resources_chapter ON resources(chapter_id, sort);
-- Every upload/link change is a new version; nothing is overwritten (rollback = change current_version).
CREATE TABLE IF NOT EXISTS resource_versions (
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  url TEXT,
  storage_key TEXT,
  checksum TEXT,
  size_bytes INTEGER,
  change_note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (resource_id, version)
);
-- Page / slide → video timestamp mapping.
CREATE TABLE IF NOT EXISTS resource_maps (
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  video_asset_id TEXT NOT NULL REFERENCES video_assets(id),
  start_sec INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (resource_id, position)
);
CREATE TABLE IF NOT EXISTS notes (chapter_id TEXT PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE, current_version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS note_versions (
  chapter_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  sections_json TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chapter_id, version)
);

-- ---------- Assessment (answers live only in question_versions; never sent before submission) ----------
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  type TEXT NOT NULL DEFAULT 'mcq' CHECK (type IN ('mcq','written','short')),
  difficulty INTEGER NOT NULL DEFAULT 2,
  current_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter_id, status);
CREATE TABLE IF NOT EXISTS question_versions (
  question_id TEXT NOT NULL REFERENCES questions(id),
  version INTEGER NOT NULL,
  text TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  answer INTEGER,
  explanation TEXT NOT NULL DEFAULT '',
  rubric TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (question_id, version)
);
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('chapter_quiz','model','written')),
  book_id TEXT REFERENCES books(id),
  chapter_id TEXT REFERENCES chapters(id),
  duration_sec INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  pass_pct INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  opens_at INTEGER,
  closes_at INTEGER,
  created_at INTEGER NOT NULL
);
-- Attempts store the exact question versions used, so later edits never change history.
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid),
  exam_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress','graded','expired','legacy')),
  questions_json TEXT NOT NULL,
  answers_json TEXT,
  score INTEGER,
  total INTEGER,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  submitted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(uid, started_at DESC);

-- ---------- Learning activity (server-validated) ----------
CREATE TABLE IF NOT EXISTS study_events (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('video','pdf','ppt','notes','exam','focus')),
  resource_id TEXT,
  chapter_id TEXT,
  subject_id TEXT,
  claimed_sec INTEGER NOT NULL,
  accepted_sec INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_study_user ON study_events(uid, started_at DESC);
CREATE TABLE IF NOT EXISTS daily_stats (uid TEXT NOT NULL, day TEXT NOT NULL, active_sec INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, day));
CREATE TABLE IF NOT EXISTS daily_subject_stats (uid TEXT NOT NULL, day TEXT NOT NULL, subject_id TEXT NOT NULL, active_sec INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, day, subject_id));
CREATE TABLE IF NOT EXISTS completions (uid TEXT NOT NULL, item_id TEXT NOT NULL, chapter_id TEXT, kind TEXT NOT NULL, completed_at INTEGER NOT NULL, PRIMARY KEY (uid, item_id));
-- XP can only be earned once per source (UNIQUE uid+source_id) → no duplicate points.
CREATE TABLE IF NOT EXISTS xp_ledger (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (uid, source_id)
);
CREATE INDEX IF NOT EXISTS idx_xp_user_time ON xp_ledger(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_xp_time ON xp_ledger(created_at);
CREATE TABLE IF NOT EXISTS achievements (uid TEXT NOT NULL, achievement_id TEXT NOT NULL, unlocked_at INTEGER NOT NULL, PRIMARY KEY (uid, achievement_id));
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, uid TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(uid, created_at DESC);

-- ---------- Community ----------
CREATE TABLE IF NOT EXISTS groups_ (id TEXT PRIMARY KEY, name TEXT NOT NULL, about TEXT NOT NULL DEFAULT '', type TEXT NOT NULL CHECK (type IN ('study','research')), icon TEXT NOT NULL DEFAULT 'users', active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE, uid TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (group_id, uid));
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_uid TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  media_json TEXT NOT NULL DEFAULT '[]',
  poll_json TEXT,
  group_id TEXT,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','research')),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','held','removed')),
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_group ON posts(group_id, created_at DESC);
CREATE TABLE IF NOT EXISTS post_likes (post_id TEXT NOT NULL, uid TEXT NOT NULL, PRIMARY KEY (post_id, uid));
CREATE TABLE IF NOT EXISTS poll_votes (post_id TEXT NOT NULL, uid TEXT NOT NULL, option_index INTEGER NOT NULL, PRIMARY KEY (post_id, uid));
CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, author_uid TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'visible', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE TABLE IF NOT EXISTS follows (follower_uid TEXT NOT NULL, followee_uid TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (follower_uid, followee_uid));
CREATE TABLE IF NOT EXISTS blocks (uid TEXT NOT NULL, blocked_uid TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (uid, blocked_uid));
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, reporter_uid TEXT NOT NULL, target_type TEXT NOT NULL CHECK (target_type IN ('post','comment','user','group')), target_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')), resolved_by TEXT, created_at INTEGER NOT NULL, resolved_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);

-- ---------- Platform ----------
CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, created_by TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_by TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_uid TEXT, actor_email TEXT, actor_role TEXT, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail_json TEXT NOT NULL DEFAULT '{}', ip TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
`,
  },
  {
    id: '0002_existing_profiles',
    sql: `
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN birth_year INTEGER;
ALTER TABLE users ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}';
INSERT OR IGNORE INTO levels (id, name_en, name_bn, name_zh, sort) VALUES
  ('c9', 'Class 9', '', '', 1),
  ('c10', 'Class 10', '', '', 2),
  ('hsc', 'Higher Secondary', '', '', 3),
  ('uni', 'University', '', '', 4);
`,
  },
];
