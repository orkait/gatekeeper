-- Orkait Auth Control Plane - Consolidated Schema
-- Created: 2026-01-31
-- This is a fresh consolidated migration combining all previous migrations

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    email_verified INTEGER DEFAULT 0,
    google_id TEXT UNIQUE,
    name TEXT,
    avatar_url TEXT,
    status TEXT DEFAULT 'active',
    locked_until INTEGER DEFAULT NULL,
    failed_login_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Tenants Table (Organizations)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    global_quota_limit INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_tenants_name ON tenants(name);

-- Tenant Users Table (user-tenant membership with roles)
CREATE TABLE IF NOT EXISTS tenant_users (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_role ON tenant_users(role);

-- ============================================================================
-- AUTHENTICATION & SESSIONS
-- ============================================================================

-- Sessions Table (per-service sessions)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    refresh_token_hash TEXT,
    device_info TEXT,
    ip_address TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    revoked_at INTEGER,
    UNIQUE(user_id, tenant_id, service)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_service ON sessions(service);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash ON sessions(refresh_token_hash);

-- Email Verification Tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    tokenHash TEXT NOT NULL UNIQUE,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    verifiedAt INTEGER DEFAULT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verification_token_hash ON email_verification_tokens(tokenHash);
CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON email_verification_tokens(userId);
CREATE INDEX IF NOT EXISTS idx_email_verification_expires_at ON email_verification_tokens(expiresAt);

-- Failed Login Attempts
CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    attemptedAt INTEGER NOT NULL,
    successful INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_failed_login_email ON failed_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempted_at ON failed_login_attempts(attemptedAt);
CREATE INDEX IF NOT EXISTS idx_failed_login_ip ON failed_login_attempts(ipAddress);

-- ============================================================================
-- API KEYS
-- ============================================================================

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

-- ============================================================================
-- SUBSCRIPTIONS & USAGE
-- ============================================================================

-- Tenant Subscriptions
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'past_due')),
    current_period_end INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    cancelled_at INTEGER,
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tier ON tenant_subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_period ON tenant_subscriptions(current_period_end);

-- Tenant Subscription Items (per-service enablement)
CREATE TABLE IF NOT EXISTS tenant_subscription_items (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    UNIQUE(subscription_id, service)
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscription_items_subscription ON tenant_subscription_items(subscription_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscription_items_service ON tenant_subscription_items(service);
CREATE INDEX IF NOT EXISTS idx_tenant_subscription_items_enabled ON tenant_subscription_items(enabled);

-- Usage Events (with idempotency support)
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

-- ============================================================================
-- FEATURE FLAGS & ADMIN OVERRIDES
-- ============================================================================

-- Feature Flags
CREATE TABLE IF NOT EXISTS feature_flags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    enabled_tiers TEXT NOT NULL DEFAULT '[]',
    enabled_tenants TEXT NOT NULL DEFAULT '[]',
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags(name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_active ON feature_flags(active);

-- Admin Overrides
CREATE TABLE IF NOT EXISTS admin_overrides (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('quota_boost', 'tier_upgrade', 'feature_grant')),
    value TEXT NOT NULL,
    reason TEXT NOT NULL,
    granted_by TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_admin_overrides_tenant ON admin_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_overrides_type ON admin_overrides(type);
CREATE INDEX IF NOT EXISTS idx_admin_overrides_expires ON admin_overrides(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_overrides_granted_by ON admin_overrides(granted_by);

-- ============================================================================
-- WEBHOOKS
-- ============================================================================

-- Webhook Endpoints
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '[]',
    secret TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON webhook_endpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON webhook_endpoints(active);

-- Webhook Events
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    delivered_at INTEGER,
    last_attempt_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_endpoint ON webhook_events(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_delivered ON webhook_events(delivered_at) WHERE delivered_at IS NOT NULL;
