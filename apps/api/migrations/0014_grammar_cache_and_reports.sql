-- Migration 0014: Shared D1 grammar cache (LanguageTool) and translation cache reporting
CREATE TABLE IF NOT EXISTS grammar_cache (
  cache_key TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  source_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL DEFAULT '',
  points_json TEXT NOT NULL DEFAULT '[]',
  hits INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grammar_cache_lang ON grammar_cache(language, updated_at);

ALTER TABLE translation_cache ADD COLUMN reported INTEGER NOT NULL DEFAULT 0;
ALTER TABLE translation_cache ADD COLUMN report_note TEXT NOT NULL DEFAULT '';
