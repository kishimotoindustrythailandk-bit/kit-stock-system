-- v2.9: index บนคอลัมน์ที่ join จริงทุกครั้งที่โหลดหน้าหลัก
-- GET /api/due ทำ LEFT JOIN delivery_tag_scans + GROUP BY ทุกแถวโดยไม่มี index
CREATE INDEX IF NOT EXISTS `delivery_tag_scans_due_idx` ON `delivery_tag_scans` (`due_line_id`);
CREATE INDEX IF NOT EXISTS `delivery_tag_receipts_due_idx` ON `delivery_tag_receipts` (`due_line_id`);
CREATE INDEX IF NOT EXISTS `delivery_due_lines_import_idx` ON `delivery_due_lines` (`import_id`);
CREATE INDEX IF NOT EXISTS `delivery_due_lines_lookup_idx`
  ON `delivery_due_lines` (`delivery_date`, `fact`, `material_code`);
CREATE INDEX IF NOT EXISTS `app_sessions_user_idx` ON `app_sessions` (`user_id`);
CREATE INDEX IF NOT EXISTS `app_sessions_expiry_idx` ON `app_sessions` (`expires_at`);
