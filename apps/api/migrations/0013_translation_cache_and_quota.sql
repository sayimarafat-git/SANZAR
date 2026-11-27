CREATE TABLE IF NOT EXISTS translation_cache (
  cache_key TEXT PRIMARY KEY,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_pinyin TEXT NOT NULL DEFAULT '',
  target_pinyin TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  hits INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_translation_cache_pair ON translation_cache(source_language, target_language, updated_at);

CREATE TABLE IF NOT EXISTS translation_quota_monthly (
  month_key TEXT PRIMARY KEY,
  chars_used INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0013_translation_cache_and_quota', 0);
