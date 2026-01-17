-- Orkait Auth & Subscription Service
-- Database Schema v1

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
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- API Products Table
CREATE TABLE IF NOT EXISTS api_products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON api_products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON api_products(status);

-- Subscription Tiers Table
CREATE TABLE IF NOT EXISTS subscription_tiers (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES api_products(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    api_calls_limit INTEGER NOT NULL,
    resource_limit INTEGER NOT NULL,
    rate_limit_rpm INTEGER DEFAULT 60,
    features TEXT,
    status TEXT DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    UNIQUE(product_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_tiers_product ON subscription_tiers(product_id);

-- Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    product_id TEXT NOT NULL REFERENCES api_products(id),
    tier_id TEXT NOT NULL REFERENCES subscription_tiers(id),
    status TEXT DEFAULT 'active',
    current_period_start INTEGER NOT NULL,
    current_period_end INTEGER NOT NULL,
    external_subscription_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    cancelled_at INTEGER,
    UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_product ON subscriptions(product_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period ON subscriptions(current_period_end);

-- API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'active',
    allowed_ips TEXT,
    allowed_origins TEXT,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_api_keys_subscription ON api_keys(subscription_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- Usage Tracking Table
CREATE TABLE IF NOT EXISTS usage (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    api_key_id TEXT REFERENCES api_keys(id),
    period_start INTEGER NOT NULL,
    period_end INTEGER NOT NULL,
    api_calls INTEGER DEFAULT 0,
    resource_count INTEGER DEFAULT 0,
    current_window_start INTEGER,
    current_window_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    UNIQUE(subscription_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_subscription ON usage(subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_period ON usage(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_api_key ON usage(api_key_id);

-- Webhook Configurations Table
CREATE TABLE IF NOT EXISTS webhook_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    last_success_at INTEGER,
    last_failure_at INTEGER,
    consecutive_failures INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhook_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhook_configs(status);

-- Webhook Deliveries Table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,
    webhook_config_id TEXT NOT NULL REFERENCES webhook_configs(id),
    event_type TEXT NOT NULL,
    event_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    response_status INTEGER,
    response_body TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    delivered_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_deliveries_config ON webhook_deliveries(webhook_config_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_event ON webhook_deliveries(event_id);

-- Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
