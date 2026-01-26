-- Orkait Auth Control Plane
-- Migration 0007: Optimized indexes for common query patterns

-- Sessions: Improve queries filtering by user_id for active sessions
-- Used by: getByUser(), revokeByUser()
CREATE INDEX IF NOT EXISTS idx_sessions_user_active
    ON sessions(user_id) WHERE revoked_at IS NULL;

-- Sessions: Improve refresh token lookups for active sessions
-- Used by: getByRefreshTokenHash()
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_active
    ON sessions(refresh_token_hash) WHERE revoked_at IS NULL;

-- Refresh tokens: Improve lookups for active tokens
-- Used by: get()
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash_active
    ON refresh_tokens(token_hash) WHERE revoked_at IS NULL;

-- Refresh tokens: Improve bulk revocation performance
-- Used by: revokeAllForUser()
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
    ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- Tenant users: Composite index for owner count queries
-- Used by: countOwners()
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_role
    ON tenant_users(tenant_id, role);

-- Sessions: Composite index for user+tenant+service lookups (active sessions)
-- Used by: getByUserAndService()
-- Note: Matches the UNIQUE(user_id, tenant_id, service) constraint but filtered
CREATE INDEX IF NOT EXISTS idx_sessions_user_tenant_service_active
    ON sessions(user_id, tenant_id, service) WHERE revoked_at IS NULL;

-- Sessions: Composite index for user+service revocation
-- Used by: revokeByUserAndService()
CREATE INDEX IF NOT EXISTS idx_sessions_user_service_active
    ON sessions(user_id, service) WHERE revoked_at IS NULL;
