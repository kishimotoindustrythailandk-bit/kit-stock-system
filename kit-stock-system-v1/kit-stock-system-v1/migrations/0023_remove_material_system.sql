-- เลื่อนจาก 0022 เพื่อไม่ให้เลข migration ซ้ำ และคง IF EXISTS ให้ปลอดภัยกับฐานเดิม
DROP TABLE IF EXISTS material_transactions;
DROP TABLE IF EXISTS material_lots;
DROP TABLE IF EXISTS material_suppliers;
