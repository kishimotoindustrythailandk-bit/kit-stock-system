CREATE TABLE IF NOT EXISTS stock_manual_receive_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_no TEXT NOT NULL UNIQUE,
  material_code TEXT NOT NULL,
  total_qty INTEGER NOT NULL CHECK (total_qty > 0),
  pack_qty INTEGER NOT NULL CHECK (pack_qty > 0),
  tag_count INTEGER NOT NULL CHECK (tag_count > 0),
  job_no TEXT NOT NULL,
  production_date TEXT NOT NULL,
  reference_no TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  duplicate_confirmed INTEGER NOT NULL DEFAULT 0,
  received_by_name TEXT NOT NULL,
  received_by_code TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_code) REFERENCES stock_parts(material_code) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_manual_receive_transactions_job
ON stock_manual_receive_transactions(material_code, job_no, received_at);
--> statement-breakpoint
ALTER TABLE stock_manual_receipts ADD COLUMN transaction_id INTEGER REFERENCES stock_manual_receive_transactions(id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_stock_manual_receipts_transaction
ON stock_manual_receipts(transaction_id, id);
