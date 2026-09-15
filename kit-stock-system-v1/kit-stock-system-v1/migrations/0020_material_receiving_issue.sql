CREATE TABLE material_suppliers (
  code TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  label_format TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO material_suppliers (code, name, label_format) VALUES
  ('UNITED_COIL', 'United Coil Center Limited', 'Barcode 1D'),
  ('CS_METAL_2D', 'C.S. Metal Co., Ltd. (Data Matrix)', 'Data Matrix PACK2D'),
  ('SUMISHO', 'Sumisho Metal (Thailand) Co., Ltd.', 'Code 39 / QR'),
  ('CS_METAL_COIL', 'C.S. Metal Co., Ltd. (Coil Label)', 'Barcode 1D'),
  ('GREEN_INDUSTRY', 'Green Industry', 'Barcode 1D'),
  ('CENTRAL_METALS', 'Central Metals (Thailand) Ltd.', 'QR / Barcode 1D');

CREATE TABLE material_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT NOT NULL UNIQUE,
  supplier_code TEXT NOT NULL REFERENCES material_suppliers(code),
  barcode_value TEXT NOT NULL,
  pack_no TEXT NOT NULL DEFAULT '',
  material_code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  spec TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  lot_no TEXT NOT NULL DEFAULT '',
  coil_no TEXT NOT NULL DEFAULT '',
  original_qty INTEGER NOT NULL DEFAULT 0,
  remaining_qty INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'SHEET',
  original_weight_kg REAL NOT NULL DEFAULT 0,
  remaining_weight_kg REAL NOT NULL DEFAULT 0,
  supplier_date TEXT NOT NULL DEFAULT '',
  received_date TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'in_stock',
  raw_payload TEXT NOT NULL,
  received_by_name TEXT NOT NULL,
  received_by_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(supplier_code, barcode_value)
);

CREATE INDEX idx_material_lots_material_status
  ON material_lots(material_code, status);
CREATE INDEX idx_material_lots_supplier_status
  ON material_lots(supplier_code, status);

CREATE TABLE material_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_no TEXT NOT NULL UNIQUE,
  lot_id INTEGER NOT NULL REFERENCES material_lots(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  weight_kg REAL NOT NULL DEFAULT 0,
  qty_balance_after INTEGER NOT NULL DEFAULT 0,
  weight_balance_after REAL NOT NULL DEFAULT 0,
  job_no TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL,
  actor_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_material_transactions_lot_created
  ON material_transactions(lot_id, created_at DESC);
CREATE INDEX idx_material_transactions_type_created
  ON material_transactions(type, created_at DESC);
