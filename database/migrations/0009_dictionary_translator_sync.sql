-- Expand dictionary_entries for Bangla headwords + tone-stripped phonetic search
CREATE TABLE IF NOT EXISTS dictionary_entries_v2 (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL CHECK (language IN ('zh','en','bn')),
  word TEXT NOT NULL,
  phonetic TEXT NOT NULL DEFAULT '',
  phonetic_plain TEXT NOT NULL DEFAULT '',
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

INSERT OR IGNORE INTO dictionary_entries_v2
  (id, language, word, phonetic, phonetic_plain, part_of_speech, meaning_en, meaning_bn, meaning_zh, example, example_translation, hsk_level, status, created_by, created_at, updated_at)
SELECT
  id, language, word, phonetic, lower(phonetic), part_of_speech, meaning_en, meaning_bn, meaning_zh, example, example_translation, hsk_level, status, created_by, created_at, updated_at
FROM dictionary_entries;

DROP TABLE dictionary_entries;
ALTER TABLE dictionary_entries_v2 RENAME TO dictionary_entries;

CREATE INDEX IF NOT EXISTS idx_dict_lang_word ON dictionary_entries(language, word);
CREATE INDEX IF NOT EXISTS idx_dict_status_hsk ON dictionary_entries(status, hsk_level);
CREATE INDEX IF NOT EXISTS idx_dict_status_pos ON dictionary_entries(status, part_of_speech);
CREATE INDEX IF NOT EXISTS idx_dict_phonetic_plain ON dictionary_entries(phonetic_plain);

-- Saved vocabulary: private learning collection synchronized per Firebase UID
CREATE TABLE IF NOT EXISTS saved_vocabulary (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  dictionary_entry_id TEXT,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  word TEXT NOT NULL,
  phonetic TEXT NOT NULL DEFAULT '',
  meaning TEXT NOT NULL DEFAULT '',
  example TEXT NOT NULL DEFAULT '',
  hsk_level TEXT NOT NULL DEFAULT '',
  part_of_speech TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_saved_vocabulary_user_created ON saved_vocabulary(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_vocabulary_user_updated ON saved_vocabulary(user_id, updated_at DESC);

-- Translation history: private translation activity synchronized per Firebase UID
CREATE TABLE IF NOT EXISTS translation_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_translation_history_user_time ON translation_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_translation_history_user_updated ON translation_history(user_id, updated_at DESC);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0009_dictionary_translator_sync', 0);
