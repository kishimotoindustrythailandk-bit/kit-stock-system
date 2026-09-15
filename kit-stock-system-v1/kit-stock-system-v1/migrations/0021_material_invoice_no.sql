ALTER TABLE material_lots
  ADD COLUMN invoice_no TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_material_lots_invoice_no
  ON material_lots(invoice_no);
