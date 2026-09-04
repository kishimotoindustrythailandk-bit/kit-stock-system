-- v2.9: บังคับเปลี่ยน PIN ครั้งแรก และเปิดทางให้ทุกบัญชีเปลี่ยน PIN ตัวเองได้
-- เดิมบัญชี ADMIN ถูก seed ด้วยค่า 'ENV_INITIAL_ADMIN_PIN' แล้วเทียบกับ
-- environment variable แบบข้อความล้วน จึงไม่เคยถูกแฮชและเปลี่ยนในแอปไม่ได้เลย
ALTER TABLE `app_users` ADD COLUMN `must_change_pin` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `app_users` SET `must_change_pin` = 1 WHERE `pin_hash` = 'ENV_INITIAL_ADMIN_PIN';
