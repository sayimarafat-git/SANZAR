ALTER TABLE announcements ADD COLUMN expires_at INTEGER;
ALTER TABLE exams ADD COLUMN xp_reward INTEGER;
ALTER TABLE questions ADD COLUMN xp_points INTEGER;

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0005_admin_enhancements', 0);
