CREATE TABLE IF NOT EXISTS sync_operations (
  uid TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  op_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',
  processed_at INTEGER NOT NULL,
  PRIMARY KEY (uid, operation_id)
);

CREATE TABLE IF NOT EXISTS resource_manifest (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  url TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  platform_min_version TEXT NOT NULL DEFAULT '1.0.0',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0003_sync_and_resources', 0);
