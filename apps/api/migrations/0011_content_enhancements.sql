-- Add optional thumbnails to subjects, chapters, resources + whole-chapter flag + Q&A table
ALTER TABLE subjects ADD COLUMN thumbnail_url TEXT;
ALTER TABLE chapters ADD COLUMN thumbnail_url TEXT;
ALTER TABLE chapters ADD COLUMN is_whole_chapter INTEGER NOT NULL DEFAULT 0;
ALTER TABLE resources ADD COLUMN thumbnail_url TEXT;

CREATE TABLE IF NOT EXISTS chapter_qa (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapter_qa_chapter ON chapter_qa(chapter_id, sort);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0011_content_enhancements', 0);
