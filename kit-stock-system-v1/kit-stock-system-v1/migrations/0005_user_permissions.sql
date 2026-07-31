CREATE TABLE IF NOT EXISTS app_user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER NOT NULL,
  permission_key TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_permissions_user_key_unique
ON app_user_permissions (user_id, permission_key);
