/**
 * Test Helpers and Mock Factories
 * 
 * Common utilities for creating mocks and test fixtures.
 */

import { vi } from 'vitest';
import type { Context } from 'hono';
import type { AuthRepository } from '@/repositories';

/**
 * Creates a mock AuthRepository with all methods as vi.fn()
 * Returns Partial<AuthRepository> to allow flexible mocking
 */
export function createMockRepository(): Partial<AuthRepository> & {
  [K in keyof AuthRepository]: AuthRepository[K] extends (...args: any[]) => any
    ? ReturnType<typeof vi.fn>
    : AuthRepository[K];
} {
  return {
    // User operations
    getUserById: vi.fn(),
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),

    // Tenant operations
    getTenantById: vi.fn(),
    getTenantByName: vi.fn(),
    createTenantWithOwner: vi.fn(),
    updateTenant: vi.fn(),
    getTenantUser: vi.fn(),
    getTenantUsers: vi.fn(),
    getUserTenants: vi.fn(),
    addUserToTenant: vi.fn(),
    updateTenantUserRole: vi.fn(),
    removeUserFromTenant: vi.fn(),
    countTenantOwners: vi.fn(),

    // Session operations
    getSessionById: vi.fn(),
    getSessionByUserAndService: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    revokeSession: vi.fn(),
    revokeUserSessions: vi.fn(),
    revokeUserServiceSession: vi.fn(),

    // Refresh token operations
    getRefreshToken: vi.fn(),
    createRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeAllUserRefreshTokens: vi.fn(),

    // Raw query operations
    rawFirst: vi.fn(),
    rawAll: vi.fn(),
    rawRun: vi.fn(),
  } as any;
}

/**
 * Creates a mock D1Database
 */
export function createMockD1Database() {
  const mockStatement = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    raw: vi.fn(),
  };

  return {
    prepare: vi.fn(() => mockStatement),
    batch: vi.fn(),
    dump: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

/**
 * Creates a mock KVNamespace
 */
export function createMockKVNamespace() {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

/**
 * Creates a mock R2Bucket
 */
export function createMockR2Bucket() {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    head: vi.fn(),
  } as unknown as R2Bucket;
}

/**
 * Creates a mock Hono Context
 */
export function createMockContext(overrides: Partial<Context> = {}): Context {
  const mockD1 = createMockD1Database();
  const mockKV = createMockKVNamespace();
  const mockR2 = createMockR2Bucket();

  return {
    req: {
      json: vi.fn(),
      text: vi.fn(),
      header: vi.fn(),
      param: vi.fn(),
      query: vi.fn(),
      url: 'http://localhost:8787/test',
      method: 'GET',
    },
    json: vi.fn((data, status) => ({ data, status })),
    text: vi.fn((text, status) => ({ text, status })),
    html: vi.fn(),
    redirect: vi.fn(),
    get: vi.fn((key: string) => {
      if (key === 'db') return mockD1;
      if (key === 'authCache') return mockKV;
      return undefined;
    }),
    set: vi.fn(),
    env: {
      DB: mockD1,
      AUTH_CACHE: mockKV,
      BACKUP_BUCKET: mockR2,
      JWT_SECRET: 'test-secret-key',
      INTERNAL_SECRET: 'test-internal-secret',
      ENVIRONMENT: 'test',
    },
    var: {},
    executionCtx: {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    },
    ...overrides,
  } as unknown as Context;
}

/**
 * Mock data generators
 */
export const mockData = {
  user: (overrides: Partial<any> = {}) => ({
    id: 'usr_test123',
    email: 'test@example.com',
    emailVerified: false,
    passwordHash: null,
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }),

  tenant: (overrides: Partial<any> = {}) => ({
    id: 'tenant_test123',
    name: 'Test Tenant',
    globalQuotaLimit: 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }),

  session: (overrides: Partial<any> = {}) => ({
    id: 'sess_test123',
    userId: 'usr_test123',
    tenantId: 'tenant_test123',
    service: 'web',
    refreshTokenHash: 'hash_test',
    expiresAt: Date.now() + 86400000, // 24 hours
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revokedAt: null,
    ...overrides,
  }),

  apiKey: (overrides: Partial<any> = {}) => ({
    id: 'ak_test123',
    tenantId: 'tenant_test123',
    keyHash: 'hash_test',
    keyPrefix: 'oka_live_test',
    name: 'Test API Key',
    scopes: ['read', 'write'],
    quotaLimit: 1000,
    quotaPeriod: 'month' as const,
    status: 'active' as const,
    createdBy: 'usr_test123',
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: Date.now(),
    ...overrides,
  }),

  refreshToken: (overrides: Partial<any> = {}) => ({
    id: 'rt_test123',
    sessionId: 'sess_test123',
    tokenHash: 'hash_test',
    expiresAt: Date.now() + 2592000000, // 30 days
    createdAt: Date.now(),
    revokedAt: null,
    ...overrides,
  }),

  usageEvent: (overrides: Partial<any> = {}) => ({
    id: 'ue_test123',
    tenantId: 'tenant_test123',
    apiKeyId: 'ak_test123',
    userId: null,
    service: 'api',
    action: 'request',
    quantity: 1,
    period: '2026-01',
    timestamp: Date.now(),
    idempotencyKey: null,
    ...overrides,
  }),
};

/**
 * Helper to wait for async operations
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper to generate test IDs
 */
export function generateTestId(prefix: string): string {
  return `${prefix}_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Helper to create a mock JWT payload
 */
export function createMockJWTPayload(overrides: Partial<any> = {}) {
  return {
    sub: 'usr_test123',
    tenant_id: 'tenant_test123',
    session_id: 'sess_test123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    aud: 'web',
    iss: 'orka-auth',
    ...overrides,
  };
}

/**
 * Helper to create mock API key JWT payload
 */
export function createMockApiKeyJWTPayload(overrides: Partial<any> = {}) {
  return {
    tenant_id: 'tenant_test123',
    api_key_id: 'ak_test123',
    scope: ['read', 'write'],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    aud: 'api',
    iss: 'orka-auth',
    ...overrides,
  };
}
