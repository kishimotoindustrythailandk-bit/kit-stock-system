INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT user_id, 'arrange'
FROM app_user_permissions
WHERE permission_key = 'scan'
  AND user_id IN (SELECT id FROM app_users WHERE role IN ('admin', 'dispatcher'));

INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT user_id, 'dispatch'
FROM app_user_permissions
WHERE permission_key = 'scan'
  AND user_id IN (SELECT id FROM app_users WHERE role IN ('admin', 'inspector'));

INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'arrange' FROM app_users WHERE role = 'admin';

INSERT OR IGNORE INTO app_user_permissions (user_id, permission_key)
SELECT id, 'dispatch' FROM app_users WHERE role = 'admin';
