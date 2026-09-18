CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_key TEXT NOT NULL,
  module_label TEXT NOT NULL,
  action_key TEXT NOT NULL,
  action_label TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  before_json TEXT NOT NULL DEFAULT '',
  after_json TEXT NOT NULL DEFAULT '',
  actor_id INTEGER,
  actor_code TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module_action ON audit_logs(module_key, action_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
