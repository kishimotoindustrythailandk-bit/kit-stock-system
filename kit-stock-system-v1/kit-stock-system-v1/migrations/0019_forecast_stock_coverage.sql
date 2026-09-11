CREATE TABLE forecast_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_token TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  source_calculated_at TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  material_count INTEGER NOT NULL DEFAULT 0,
  total_qty INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading',
  imported_by_name TEXT NOT NULL,
  imported_by_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT
);

CREATE INDEX idx_forecast_imports_status_created
  ON forecast_imports(status, created_at DESC);

CREATE TABLE forecast_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES forecast_imports(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  material_code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  delivery_date TEXT NOT NULL,
  delivery_time TEXT NOT NULL,
  prod_qty INTEGER NOT NULL,
  delivery_spot TEXT NOT NULL DEFAULT '',
  factory TEXT NOT NULL DEFAULT '',
  shop TEXT NOT NULL DEFAULT '',
  line TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(import_id, source_key)
);

CREATE INDEX idx_forecast_lines_import_material_date
  ON forecast_lines(import_id, material_code, delivery_date, delivery_time);
