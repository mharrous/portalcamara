CREATE TABLE IF NOT EXISTS login_codes (
  code_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  application_code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (application_code) REFERENCES applications(code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_login_codes_expiry ON login_codes(expires_at);
