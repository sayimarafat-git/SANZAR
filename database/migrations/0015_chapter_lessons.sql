-- Add nested Lesson support under Chapters (Book -> Chapter -> Lesson)
ALTER TABLE chapters ADD COLUMN parent_chapter_id TEXT REFERENCES chapters(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_chapters_parent ON chapters(parent_chapter_id, sort, number);
