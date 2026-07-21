INSERT INTO users (legacy_username, display_name, role, active, auth_provider)
VALUES
  ('admin', 'Administrador', 'admin', 1, 'local'),
  ('usuario', 'Usuario', 'user', 1, 'local')
ON CONFLICT(legacy_username) DO NOTHING;

INSERT INTO user_application_permissions (user_id, application_code, role, active)
SELECT users.id, applications.code, 'user', 1
FROM users
CROSS JOIN applications
WHERE users.legacy_username = 'usuario' AND applications.active = 1
ON CONFLICT(user_id, application_code) DO NOTHING;
