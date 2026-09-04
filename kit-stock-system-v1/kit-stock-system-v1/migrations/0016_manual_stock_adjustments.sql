CREATE TABLE IF NOT EXISTS stock_manual_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_tag_id INTEGER NOT NULL,
  tag_id TEXT NOT NULL,
  material_code TEXT NOT NULL,
  qty INTEGER NOT NULL,
  job_no TEXT NOT NULL,
  production_date TEXT NOT NULL,
  reference_no TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  received_by_name TEXT NOT NULL,
  received_by_code TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (stock_tag_id) REFERENCES stock_tags(id) ON DELETE RESTRICT,
  FOREIGN KEY (material_code) REFERENCES stock_parts(material_code) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_stock_manual_receipts_material_date
ON stock_manual_receipts(material_code, received_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS stock_count_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_no TEXT NOT NULL UNIQUE,
  count_date TEXT NOT NULL,
  material_code TEXT NOT NULL,
  system_qty INTEGER NOT NULL,
  counted_qty INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  reason TEXT NOT NULL,
  adjusted_by_name TEXT NOT NULL,
  adjusted_by_code TEXT NOT NULL,
  adjusted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_code) REFERENCES stock_parts(material_code) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_stock_count_adjustments_material_date
ON stock_count_adjustments(material_code, count_date, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS stock_count_adjustment_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_id INTEGER NOT NULL,
  stock_tag_id INTEGER NOT NULL,
  stock_tag_code TEXT NOT NULL,
  qty_change INTEGER NOT NULL,
  before_qty INTEGER NOT NULL,
  after_qty INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (adjustment_id) REFERENCES stock_count_adjustments(id) ON DELETE CASCADE,
  FOREIGN KEY (stock_tag_id) REFERENCES stock_tags(id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_stock_count_adjustment_lines_adjustment
ON stock_count_adjustment_lines(adjustment_id, id);
