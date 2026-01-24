-- Orkait Auth Control Plane
-- Migration 0003: Enhanced API keys and usage events tables

-- Drop old api_keys table and recreate with new schema
-- Note: In production, use ALTER TABLE statements to preserve data
DROP TABLE IF EXISTS api_keys;

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT,
    scopes TEXT NOT NULL DEFAULT '[]',
    quota_limit INTEGER,
    quota_period TEXT CHECK (quota_period IN ('hour', 'day', 'month')),
    status TEXT DEFAULT 'active',
    created_by TEXT NOT NULL REFERENCES users(id),
    last_used_at INTEGER,
    expires_at INTEGER,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON api_keys(created_by);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- Usage Events Table (with idempotency support)
CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    service TEXT NOT NULL,
    action TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    period TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    idempotency_key TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant ON usage_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_api_key ON usage_events(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_service ON usage_events(service);
CREATE INDEX IF NOT EXISTS idx_usage_events_period ON usage_events(period);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp ON usage_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_period ON usage_events(tenant_id, period);
CREATE INDEX IF NOT EXISTS idx_usage_events_idempotency ON usage_events(idempotency_key);
