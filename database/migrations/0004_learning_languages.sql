DELETE FROM levels WHERE id NOT IN ('zh', 'en');

INSERT INTO levels (id, name_en, name_bn, name_zh, sort) VALUES
  ('zh', 'Chinese', 'চীনা ভাষা', '中文', 1),
  ('en', 'English', 'ইংরেজি', '英语', 2)
ON CONFLICT(id) DO UPDATE SET
  name_en = excluded.name_en,
  name_bn = excluded.name_bn,
  name_zh = excluded.name_zh,
  sort = excluded.sort;

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0004_learning_languages', 0);
