CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    admin_id    BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_admin ON refresh_tokens (admin_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash  ON refresh_tokens (token_hash);
