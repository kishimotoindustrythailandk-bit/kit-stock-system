-- v2.9: จำกัดจำนวนครั้งที่กรอก PIN ผิด
-- PIN เป็นตัวเลข 6 หลัก (1,000,000 ค่า) เดิมไม่มีอะไรหยุดการไล่เดา
-- นับความผิดพลาดต่อรหัสพนักงาน เพราะทั้งโรงงานออกอินเทอร์เน็ตผ่าน IP เดียวกัน
-- การล็อกตาม IP จึงจะเตะพนักงานทั้งกะออกพร้อมกัน
CREATE TABLE IF NOT EXISTS `app_login_attempts` (
  `employee_code` text PRIMARY KEY NOT NULL,
  `failed_count` integer DEFAULT 0 NOT NULL,
  `locked_until` text,
  `last_failed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
