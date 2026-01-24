-- Tenant Subscription Items Table (per-service enablement)
-- Allows enabling/disabling specific services for a tenant subscription

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
