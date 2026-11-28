-- Allow 'doc' resource type while preserving resource_versions and resource_maps
PRAGMA defer_foreign_keys = ON;
CREATE TABLE _bak_rv AS SELECT * FROM resource_versions;
CREATE TABLE _bak_rm AS SELECT * FROM resource_maps;
CREATE TABLE resources_new (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video','audio','pdf','ppt','doc','link')),
  title TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  video_asset_id TEXT REFERENCES video_assets(id),
  current_version INTEGER NOT NULL DEFAULT 1,
  pages INTEGER,
  licence TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  updated_at INTEGER NOT NULL,
  thumbnail_url TEXT
);
INSERT INTO resources_new (id, chapter_id, type, title, sort, video_asset_id, current_version, pages, licence, status, updated_at, thumbnail_url)
SELECT id, chapter_id, type, title, sort, video_asset_id, current_version, pages, licence, status, updated_at, thumbnail_url FROM resources;
DROP TABLE resources;
ALTER TABLE resources_new RENAME TO resources;
CREATE INDEX IF NOT EXISTS idx_resources_chapter ON resources(chapter_id, sort);
INSERT OR IGNORE INTO resource_versions SELECT * FROM _bak_rv;
INSERT OR IGNORE INTO resource_maps SELECT * FROM _bak_rm;
DROP TABLE _bak_rv;
DROP TABLE _bak_rm;
