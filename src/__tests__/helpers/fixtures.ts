/**
 * Test Fixtures
 * 
 * Predefined test data for consistent testing.
 */

export const fixtures = {
  users: {
    john: {
      id: 'usr_john_doe',
      email: 'john@example.com',
      emailVerified: true,
      passwordHash: null,
      firstName: 'John',
      lastName: 'Doe',
      avatarUrl: 'https://example.com/avatar.jpg',
      createdAt: 1704067200000, // 2024-01-01
      updatedAt: 1704067200000,
    },
    jane: {
      id: 'usr_jane_smith',
      email: 'jane@example.com',
      emailVerified: true,
      passwordHash: null,
      firstName: 'Jane',
      lastName: 'Smith',
      avatarUrl: null,
      createdAt: 1704153600000, // 2024-01-02
      updatedAt: 1704153600000,
    },
    unverified: {
      id: 'usr_unverified',
      email: 'unverified@example.com',
      emailVerified: false,
      passwordHash: null,
      firstName: 'Unverified',
      lastName: 'User',
      avatarUrl: null,
      createdAt: 1704240000000, // 2024-01-03
      updatedAt: 1704240000000,
    },
  },

  tenants: {
    acme: {
      id: 'tenant_acme',
      name: 'Acme Corp',
      globalQuotaLimit: 10000,
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    startup: {
      id: 'tenant_startup',
      name: 'Startup Inc',
      globalQuotaLimit: 1000,
      createdAt: 1704153600000,
      updatedAt: 1704153600000,
    },
    unlimited: {
      id: 'tenant_unlimited',
      name: 'Unlimited LLC',
      globalQuotaLimit: null,
      createdAt: 1704240000000,
      updatedAt: 1704240000000,
    },
  },

  sessions: {
    johnWeb: {
      id: 'sess_john_web',
      userId: 'usr_john_doe',
      tenantId: 'tenant_acme',
      service: 'web',
      refreshTokenHash: 'hash_john_web',
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
      revokedAt: null,
    },
    janeApi: {
      id: 'sess_jane_api',
      userId: 'usr_jane_smith',
      tenantId: 'tenant_startup',
      service: 'api',
      refreshTokenHash: 'hash_jane_api',
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now() - 7200000,
      updatedAt: Date.now() - 7200000,
      revokedAt: null,
    },
    expired: {
      id: 'sess_expired',
      userId: 'usr_john_doe',
      tenantId: 'tenant_acme',
      service: 'web',
      refreshTokenHash: 'hash_expired',
      expiresAt: Date.now() - 3600000, // Expired 1 hour ago
      createdAt: Date.now() - 90000000,
      updatedAt: Date.now() - 90000000,
      revokedAt: null,
    },
    revoked: {
      id: 'sess_revoked',
      userId: 'usr_john_doe',
      tenantId: 'tenant_acme',
      service: 'web',
      refreshTokenHash: 'hash_revoked',
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 1800000,
      revokedAt: Date.now() - 1800000, // Revoked 30 min ago
    },
  },

  apiKeys: {
    acmeRead: {
      id: 'ak_acme_read',
      tenantId: 'tenant_acme',
      keyHash: 'hash_acme_read',
      keyPrefix: 'oka_live_acme_r',
      name: 'Acme Read Key',
      scopes: ['read'],
      quotaLimit: 1000,
      quotaPeriod: 'month' as const,
      status: 'active' as const,
      createdBy: 'usr_john_doe',
      lastUsedAt: Date.now() - 3600000,
      expiresAt: null,
      revokedAt: null,
      createdAt: Date.now() - 86400000,
    },
    acmeReadWrite: {
      id: 'ak_acme_rw',
      tenantId: 'tenant_acme',
      keyHash: 'hash_acme_rw',
      keyPrefix: 'oka_live_acme_w',
      name: 'Acme Read/Write Key',
      scopes: ['read', 'write'],
      quotaLimit: 5000,
      quotaPeriod: 'month' as const,
      status: 'active' as const,
      createdBy: 'usr_john_doe',
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: Date.now() - 43200000,
    },
    revoked: {
      id: 'ak_revoked',
      tenantId: 'tenant_acme',
      keyHash: 'hash_revoked_key',
      keyPrefix: 'oka_live_revoked',
      name: 'Revoked Key',
      scopes: ['read'],
      quotaLimit: 1000,
      quotaPeriod: 'month' as const,
      status: 'revoked' as const,
      createdBy: 'usr_john_doe',
      lastUsedAt: Date.now() - 7200000,
      expiresAt: null,
      revokedAt: Date.now() - 3600000,
      createdAt: Date.now() - 172800000,
    },
  },

  subscriptions: {
    acmePro: {
      id: 'sub_acme_pro',
      tenantId: 'tenant_acme',
      status: 'active',
      tier: 'pro',
      currentPeriodStart: Date.now() - 864000000, // 10 days ago
      currentPeriodEnd: Date.now() + 1728000000, // 20 days from now
      cancelAtPeriodEnd: false,
      createdAt: Date.now() - 2592000000, // 30 days ago
      updatedAt: Date.now() - 864000000,
    },
    startupFree: {
      id: 'sub_startup_free',
      tenantId: 'tenant_startup',
      status: 'active',
      tier: 'free',
      currentPeriodStart: Date.now() - 432000000, // 5 days ago
      currentPeriodEnd: Date.now() + 2160000000, // 25 days from now
      cancelAtPeriodEnd: false,
      createdAt: Date.now() - 1296000000, // 15 days ago
      updatedAt: Date.now() - 432000000,
    },
  },

  featureFlags: {
    betaFeature: {
      id: 'ff_beta',
      name: 'beta_feature',
      description: 'Beta feature for testing',
      enabledTiers: ['pro', 'enterprise'],
      enabledTenants: [],
      rolloutPercentage: 50,
      active: true,
      createdAt: Date.now() - 2592000000,
      updatedAt: Date.now() - 1296000000,
    },
    tenantSpecific: {
      id: 'ff_tenant_specific',
      name: 'tenant_specific_feature',
      description: 'Feature enabled for specific tenants',
      enabledTiers: [],
      enabledTenants: ['tenant_acme'],
      rolloutPercentage: 0,
      active: true,
      createdAt: Date.now() - 1728000000,
      updatedAt: Date.now() - 864000000,
    },
  },
};

/**
 * Helper to clone fixture data (prevents mutation)
 */
export function cloneFixture<T>(fixture: T): T {
  return JSON.parse(JSON.stringify(fixture));
}
