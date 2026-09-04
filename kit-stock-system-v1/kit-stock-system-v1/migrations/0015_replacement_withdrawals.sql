CREATE TABLE IF NOT EXISTS replacement_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_no TEXT NOT NULL UNIQUE,
  material_code TEXT NOT NULL,
  part_name TEXT NOT NULL DEFAULT '',
  customer TEXT NOT NULL DEFAULT '',
  requested_qty INTEGER NOT NULL CHECK (requested_qty > 0),
  issued_qty INTEGER NOT NULL DEFAULT 0 CHECK (issued_qty >= 0),
  reason_type TEXT NOT NULL DEFAULT 'shortage',
  reason_detail TEXT NOT NULL DEFAULT '',
  needed_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_name TEXT NOT NULL,
  requested_by_code TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS replacement_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES replacement_requests(id) ON DELETE RESTRICT,
  stock_tag_id INTEGER NOT NULL REFERENCES stock_tags(id) ON DELETE RESTRICT,
  stock_tag_code TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  notice_no TEXT NOT NULL,
  issued_by_name TEXT NOT NULL,
  issued_by_code TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  printed_by_name TEXT NOT NULL DEFAULT '',
  printed_by_code TEXT NOT NULL DEFAULT '',
  printed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_replacement_requests_status_date
ON replacement_requests(status, requested_at);

CREATE INDEX IF NOT EXISTS idx_replacement_requests_material
ON replacement_requests(material_code, status);

CREATE INDEX IF NOT EXISTS idx_replacement_issues_request
ON replacement_issues(request_id, issued_at);

CREATE INDEX IF NOT EXISTS idx_replacement_issues_stock_tag
ON replacement_issues(stock_tag_id);

INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'replacement' FROM app_users
WHERE role IN ('dispatcher', 'inspector');
