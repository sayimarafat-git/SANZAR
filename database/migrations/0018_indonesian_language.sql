-- Add Indonesian ('id') language support across levels, subjects, dictionary_entries, and grammar_rules
ALTER TABLE levels ADD COLUMN name_id TEXT;
ALTER TABLE subjects ADD COLUMN name_id TEXT;
PRAGMA defer_foreign_keys = ON;
CREATE TABLE IF NOT EXISTS dictionary_entries_v3 (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL CHECK (language IN ('zh','en','bn','id')),
  word TEXT NOT NULL,
  phonetic TEXT NOT NULL DEFAULT '',
  phonetic_plain TEXT NOT NULL DEFAULT '',
  part_of_speech TEXT NOT NULL DEFAULT '',
  meaning_en TEXT NOT NULL DEFAULT '',
  meaning_bn TEXT NOT NULL DEFAULT '',
  meaning_zh TEXT NOT NULL DEFAULT '',
  meaning_id TEXT NOT NULL DEFAULT '',
  example TEXT NOT NULL DEFAULT '',
  example_translation TEXT NOT NULL DEFAULT '',
  hsk_level TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  synonyms_json TEXT NOT NULL DEFAULT '[]',
  antonyms_json TEXT NOT NULL DEFAULT '[]',
  collocations_json TEXT NOT NULL DEFAULT '[]',
  grammar_note TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO dictionary_entries_v3
  (id, language, word, phonetic, phonetic_plain, part_of_speech, meaning_en, meaning_bn, meaning_zh, meaning_id, example, example_translation, hsk_level, status, created_by, created_at, updated_at, synonyms_json, antonyms_json, collocations_json, grammar_note)
SELECT
  id, language, word, phonetic, phonetic_plain, part_of_speech, meaning_en, meaning_bn, meaning_zh, '', example, example_translation, hsk_level, status, created_by, created_at, updated_at, synonyms_json, antonyms_json, collocations_json, grammar_note
FROM dictionary_entries;
DROP TABLE dictionary_entries;
ALTER TABLE dictionary_entries_v3 RENAME TO dictionary_entries;
CREATE INDEX IF NOT EXISTS idx_dict_lang_word ON dictionary_entries(language, word);
CREATE INDEX IF NOT EXISTS idx_dict_status_hsk ON dictionary_entries(status, hsk_level);
CREATE INDEX IF NOT EXISTS idx_dict_status_pos ON dictionary_entries(status, part_of_speech);
CREATE INDEX IF NOT EXISTS idx_dict_phonetic_plain ON dictionary_entries(phonetic_plain);
CREATE TABLE IF NOT EXISTS grammar_rules_v2 (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL CHECK (language IN ('zh','en','bn','id')),
  pattern TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  example TEXT NOT NULL DEFAULT '',
  example_translation TEXT NOT NULL DEFAULT '',
  level_tag TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO grammar_rules_v2
  (id, language, pattern, title, explanation, example, example_translation, level_tag, sort, created_at, updated_at)
SELECT
  id, language, pattern, title, explanation, example, example_translation, level_tag, sort, created_at, updated_at
FROM grammar_rules;
DROP TABLE grammar_rules;
ALTER TABLE grammar_rules_v2 RENAME TO grammar_rules;
CREATE INDEX IF NOT EXISTS idx_grammar_rules_lang ON grammar_rules(language, sort);
