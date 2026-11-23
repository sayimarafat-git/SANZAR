ALTER TABLE books ADD COLUMN cover_image TEXT;
ALTER TABLE books ADD COLUMN cover_ratio REAL;

CREATE TABLE IF NOT EXISTS dictionary_entries (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL CHECK (language IN ('zh','en')),
  word TEXT NOT NULL,
  phonetic TEXT NOT NULL DEFAULT '',
  part_of_speech TEXT NOT NULL DEFAULT '',
  meaning_en TEXT NOT NULL DEFAULT '',
  meaning_bn TEXT NOT NULL DEFAULT '',
  meaning_zh TEXT NOT NULL DEFAULT '',
  example TEXT NOT NULL DEFAULT '',
  example_translation TEXT NOT NULL DEFAULT '',
  hsk_level TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dict_lang_word ON dictionary_entries(language, word);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0006_dictionary_and_thumbnails', 0);
