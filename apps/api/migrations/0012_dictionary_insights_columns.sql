ALTER TABLE dictionary_entries ADD COLUMN synonyms_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dictionary_entries ADD COLUMN antonyms_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dictionary_entries ADD COLUMN collocations_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dictionary_entries ADD COLUMN grammar_note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS grammar_rules (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL CHECK (language IN ('zh','en','bn')),
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
CREATE INDEX IF NOT EXISTS idx_grammar_rules_lang ON grammar_rules(language, sort);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0012_dictionary_insights_columns', 0);
