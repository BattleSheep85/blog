-- TrueRank D1 Schema - migration 007
-- User accounts (email + password, PBKDF2 via WebCrypto — zero dependencies),
-- session tokens (stored hashed so a DB leak can't replay sessions), and a
-- per-user search history powering the /account "past searches" list.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  -- Format: pbkdf2$<iterations>$<salt-b64>$<hash-b64>
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  -- SHA-256 hex of the raw cookie token; the raw token never touches D1.
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- One row per (user, research) pair; re-searching the same thing bumps
-- created_at instead of duplicating the history entry.
CREATE TABLE IF NOT EXISTS user_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  research_id TEXT NOT NULL,
  query TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, research_id)
);
CREATE INDEX IF NOT EXISTS idx_user_searches_user ON user_searches(user_id, created_at DESC);
