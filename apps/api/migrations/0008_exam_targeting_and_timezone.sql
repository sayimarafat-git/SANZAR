ALTER TABLE exams ADD COLUMN level_id TEXT;
ALTER TABLE exams ADD COLUMN time_zone TEXT;

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0008_exam_targeting_and_timezone', 0);
