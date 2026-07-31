PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER NOT NULL,
  permission_key TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS app_user_permissions_user_key_unique
ON app_user_permissions (user_id, permission_key);

-- Admin เห็นทุกหน้าเสมอ
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'dashboard' FROM app_users WHERE role = 'admin';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'stock' FROM app_users WHERE role = 'admin';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'tags' FROM app_users WHERE role = 'admin';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'plan' FROM app_users WHERE role = 'admin';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'scan' FROM app_users WHERE role = 'admin';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'exports' FROM app_users WHERE role = 'admin';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'reports' FROM app_users WHERE role = 'admin';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'history' FROM app_users WHERE role = 'admin';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'settings' FROM app_users WHERE role = 'admin';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'users' FROM app_users WHERE role = 'admin';

-- ค่าเริ่มต้นเดิมของผู้จัดงาน
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'dashboard' FROM app_users WHERE role = 'dispatcher';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'stock' FROM app_users WHERE role = 'dispatcher';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'tags' FROM app_users WHERE role = 'dispatcher';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'scan' FROM app_users WHERE role = 'dispatcher';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'history' FROM app_users WHERE role = 'dispatcher';

-- ค่าเริ่มต้นเดิมของผู้ตรวจงาน
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'dashboard' FROM app_users WHERE role = 'inspector';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'scan' FROM app_users WHERE role = 'inspector';
INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'history' FROM app_users WHERE role = 'inspector';
