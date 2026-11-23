INSERT OR IGNORE INTO levels (id, name_en, name_bn, name_zh, sort) VALUES
  ('c6', 'Class 6', 'ষষ্ঠ শ্রেণি', '六年级', -2),
  ('c7', 'Class 7', 'সপ্তম শ্রেণি', '七年级', -1),
  ('c8', 'Class 8', 'অষ্টম শ্রেণি', '八年级', 0);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0004_levels_6_to_uni', 0);
