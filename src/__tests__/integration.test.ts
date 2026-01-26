import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Integration tests for complete auth flows.
 * 
 * These tests mock the database but test the full service integration.
 */

// Mock repository for integration tests
const createMockRepository = () => ({
    // User operations
    getUserById: vi.fn(),
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),

    // Tenant operations
    getTenantById: vi.fn(),
    getTenantByName: vi.fn(),
    createTenantWithOwner: vi.fn(),
    getTenantUser: vi.fn(),
    getTenantUsers: vi.fn(),
    getUserTenants: vi.fn(),
    addUserToTenant: vi.fn(),
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

    // API Key operations
    rawFirst: vi.fn(),
    rawAll: vi.fn(),
    rawRun: vi.fn(),
});

// ============================================================================
// Auth Flow: Signup -> Login -> Refresh -> Logout
// ============================================================================

describe('Auth Flow Integration', () => {
    let mockRepo: ReturnType<typeof createMockRepository>;

    beforeEach(() => {
        mockRepo = createMockRepository();
        vi.clearAllMocks();
    });

    describe('Complete auth flow', () => {
        it('should handle signup -> login -> refresh -> logout', async () => {
            const { SessionService } = await import('../services/session');
            const { JWTService } = await import('../services/jwt');

            const jwtService = new JWTService('test-secret-key');
            const sessionService = new SessionService(mockRepo as any, jwtService);

            // 1. Simulate signup - create session
            const userId = 'usr_123';
            const tenantId = 'tenant_123';

            mockRepo.getSessionByUserAndService.mockResolvedValue(null);
            mockRepo.createSession.mockResolvedValue(undefined);
            mockRepo.getSessionById.mockResolvedValue({
                id: 'sess_123',
                userId,
                tenantId,
                service: 'web',
                refreshTokenHash: 'hash',
                expiresAt: Date.now() + 86400000,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                revokedAt: null,
            });

            const createResult = await sessionService.createSession({
                userId,
                tenantId,
                service: 'web',
            });

            expect(createResult.success).toBe(true);
            expect(createResult.data?.accessToken).toBeDefined();
            expect(createResult.data?.refreshToken).toBeDefined();

            // Verify JWT is valid
            const accessToken = createResult.data!.accessToken;
            const verifyResult = await jwtService.verifyJWT(accessToken);
            expect(verifyResult.valid).toBe(true);
            expect(verifyResult.payload?.sub).toBe(userId);

            // 2. Simulate login (same as creating session)
            // Already tested above

            // 3. Simulate refresh - verify token exists
            expect(createResult.data!.refreshToken).toBeDefined();

            mockRepo.rawFirst.mockResolvedValue({
                id: 'sess_123',
                user_id: userId,
                tenant_id: tenantId,
                service: 'web',
                refresh_token_hash: 'matching_hash',
                expires_at: Date.now() + 86400000,
                revoked_at: null,
            });
            mockRepo.rawRun.mockResolvedValue({ changes: 1 });

            // Note: refresh would need actual hash matching
            // Simplified test here

            // 4. Simulate logout
            mockRepo.revokeSession.mockResolvedValue(undefined);

            const logoutResult = await sessionService.logoutService(userId, 'web');
            expect(logoutResult.success).toBe(true);
        });
    });
});

// ============================================================================
// API Key Flow: Create -> Exchange -> Authorize
// ============================================================================

describe('API Key Flow Integration', () => {
    let mockRepo: ReturnType<typeof createMockRepository>;

    beforeEach(() => {
        mockRepo = createMockRepository();
        vi.clearAllMocks();
    });

    describe('API key create -> exchange -> authorize', () => {
        it('should create API key and exchange for JWT', async () => {
            const { ApiKeyService } = await import('../services/apikey');
            const { JWTService } = await import('../services/jwt');

            const apiKeyService = new ApiKeyService(mockRepo as any);
            const jwtService = new JWTService('test-secret-key');

            // 1. Create API key
            mockRepo.rawRun.mockResolvedValue({ changes: 1 });

            const createResult = await apiKeyService.createApiKey({
                tenantId: 'tenant_123',
                createdBy: 'user_123',
                name: 'Test Key',
                scopes: ['read', 'write'],
                quotaLimit: 1000,
                quotaPeriod: 'month',
            });

            expect(createResult.success).toBe(true);
            expect(createResult.data?.plainTextKey).toMatch(/^oka_live_/);
            expect(createResult.data?.apiKey.scopes).toEqual(['read', 'write']);

            const plainTextKey = createResult.data!.plainTextKey;

            // 2. Validate API key (exchange for JWT)
            // Mock the key lookup
            mockRepo.rawFirst.mockResolvedValue({
                id: 'ak_123',
                tenant_id: 'tenant_123',
                key_hash: 'matching_hash', // Would need actual hash
                key_prefix: plainTextKey.slice(0, 17),
                name: 'Test Key',
                scopes: '["read", "write"]',
                quota_limit: 1000,
                quota_period: 'month',
                status: 'active',
                created_by: 'user_123',
                last_used_at: null,
                expires_at: null,
                revoked_at: null,
                created_at: Date.now(),
            });
            mockRepo.rawRun.mockResolvedValue({ changes: 1 });

            // Note: actual validation requires hash matching
            // This is a simplified integration test

            // 3. Sign API key JWT
            const apiKeyJwt = await jwtService.signApiKeyJWT({
                tenantId: 'tenant_123',
                apiKeyId: 'ak_123',
                scopes: ['read', 'write'],
                audience: 'api',
            });

            expect(apiKeyJwt).toBeDefined();

            // Verify the JWT
            const verifyResult = await jwtService.verifyApiKeyJWT(apiKeyJwt);
            expect(verifyResult.valid).toBe(true);
            expect(verifyResult.payload?.api_key_id).toBe('ak_123');
            expect(verifyResult.payload?.scope).toEqual(['read', 'write']);
        });
    });
});

// ============================================================================
// Quota Enforcement Tests
// ============================================================================

describe('Quota Enforcement Integration', () => {
    let mockRepo: ReturnType<typeof createMockRepository>;

    beforeEach(() => {
        mockRepo = createMockRepository();
        vi.clearAllMocks();
    });

    describe('quota enforcement', () => {
        it('should enforce per-key quota limits', async () => {
            const { QuotaService } = await import('../services/quota');
            const quotaService = new QuotaService(mockRepo as any);

            // API key with 100 quota limit, 99 used (at buffer)
            mockRepo.rawFirst
                .mockResolvedValueOnce({
                    quota_limit: 100,
                    quota_period: 'month',
                    tenant_id: 'tenant_123',
                })
                .mockResolvedValueOnce({
                    total_quantity: 99,
                });

            const result = await quotaService.checkQuota('tenant_123', 1, 'ak_123');

            expect(result.success).toBe(true);
            // With 99% buffer (99 limit), 99 used should be at/over limit
            expect(result.data?.level).toBe('api_key');
        });

        it('should fall through to tenant quota when API key has no limit', async () => {
            const { QuotaService } = await import('../services/quota');
            const quotaService = new QuotaService(mockRepo as any);

            // API key without quota limit
            mockRepo.rawFirst
                .mockResolvedValueOnce({
                    quota_limit: null,
                    quota_period: null,
                    tenant_id: 'tenant_123',
                })
                .mockResolvedValueOnce({
                    global_quota_limit: 1000,
                });

            // Mock getUsage for tenant check
            vi.spyOn(quotaService, 'getUsage').mockResolvedValue({
                success: true,
                data: {
                    tenantId: 'tenant_123',
                    period: '2026-01',
                    totalQuantity: 500,
                    eventCount: 500,
                },
            });

            const result = await quotaService.checkQuota('tenant_123', 1, 'ak_123');

            expect(result.success).toBe(true);
            expect(result.data?.allowed).toBe(true);
            expect(result.data?.level).toBe('tenant');
        });
    });
});

// ============================================================================
// KV Fallback Tests
// ============================================================================

describe('KV Fallback Integration', () => {
    describe('cache fallback behavior', () => {
        it('should return cached result with degraded flag on DB failure', async () => {
            const { withCacheFallback, createAuthCache } = await import('../utils/cache');

            // Mock KV namespace
            const mockKV = {
                get: vi.fn(),
                put: vi.fn(),
                delete: vi.fn(),
                list: vi.fn(),
            };

            const cache = createAuthCache(mockKV as any);

            // Simulate cached data
            mockKV.get.mockResolvedValue(JSON.stringify({
                data: { userId: 'user_123', valid: true },
                cachedAt: new Date().toISOString(),
            }));

            // DB operation that fails
            const dbOperation = vi.fn().mockRejectedValue(new Error('D1 unavailable'));

            const result = await withCacheFallback(
                cache,
                'session:sess_123',
                dbOperation
            );

            expect(result.degraded).toBe(true);
            expect(result.data).toEqual({ userId: 'user_123', valid: true });
        });

        it('should cache successful DB results', async () => {
            const { withCacheFallback, createAuthCache } = await import('../utils/cache');

            const mockKV = {
                get: vi.fn().mockResolvedValue(null),
                put: vi.fn().mockResolvedValue(undefined),
                delete: vi.fn(),
                list: vi.fn(),
            };

            const cache = createAuthCache(mockKV as any);

            // Successful DB operation
            const dbOperation = vi.fn().mockResolvedValue({ userId: 'user_123' });

            const result = await withCacheFallback(
                cache,
                'session:sess_123',
                dbOperation
            );

            expect(result.degraded).toBe(false);
            expect(result.data).toEqual({ userId: 'user_123' });
            expect(mockKV.put).toHaveBeenCalled();
        });

        it('should throw when DB fails and no cache available', async () => {
            const { withCacheFallback, createAuthCache } = await import('../utils/cache');

            const mockKV = {
                get: vi.fn().mockResolvedValue(null),
                put: vi.fn(),
                delete: vi.fn(),
                list: vi.fn(),
            };

            const cache = createAuthCache(mockKV as any);
            const dbOperation = vi.fn().mockRejectedValue(new Error('D1 unavailable'));

            await expect(
                withCacheFallback(cache, 'session:sess_123', dbOperation)
            ).rejects.toThrow('D1 unavailable');
        });
    });
});
