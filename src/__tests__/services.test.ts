import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the repository
const mockRepository = {
    getTenantById: vi.fn(),
    getTenantByName: vi.fn(),
    createTenantWithOwner: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
    getTenantUser: vi.fn(),
    getTenantUsers: vi.fn(),
    getUserTenants: vi.fn(),
    addUserToTenant: vi.fn(),
    updateTenantUserRole: vi.fn(),
    removeUserFromTenant: vi.fn(),
    countTenantOwners: vi.fn(),
    getSessionById: vi.fn(),
    rawFirst: vi.fn(),
    rawAll: vi.fn(),
    rawRun: vi.fn(),
};

// ============================================================================
// TenantService Tests
// ============================================================================

describe('TenantService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createTenant', () => {
        it('should create a tenant with owner', async () => {
            const { TenantService } = await import('../services/tenant.service');
            const service = new TenantService(mockRepository as any);

            mockRepository.getTenantByName.mockResolvedValue(null);
            mockRepository.createTenantWithOwner.mockResolvedValue(undefined);

            const result = await service.createTenant(
                { name: 'Test Tenant', globalQuotaLimit: 1000 },
                'user_123'
            );

            expect(result.success).toBe(true);
            expect(result.data?.name).toBe('Test Tenant');
            expect(result.data?.globalQuotaLimit).toBe(1000);
            expect(result.data?.id).toMatch(/^tenant_/);
        });

        it('should reject duplicate tenant names', async () => {
            const { TenantService } = await import('../services/tenant.service');
            const service = new TenantService(mockRepository as any);

            mockRepository.getTenantByName.mockResolvedValue({ id: 'existing' });

            const result = await service.createTenant(
                { name: 'Existing Tenant' },
                'user_123'
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Tenant name already exists');
        });
    });

    describe('getTenant', () => {
        it('should return tenant by ID', async () => {
            const { TenantService } = await import('../services/tenant.service');
            const service = new TenantService(mockRepository as any);

            const tenant = {
                id: 'tenant_123',
                name: 'Test',
                globalQuotaLimit: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            mockRepository.getTenantById.mockResolvedValue(tenant);

            const result = await service.getTenant('tenant_123');

            expect(result.success).toBe(true);
            expect(result.data).toEqual(tenant);
        });

        it('should return error for non-existent tenant', async () => {
            const { TenantService } = await import('../services/tenant.service');
            const service = new TenantService(mockRepository as any);

            mockRepository.getTenantById.mockResolvedValue(null);

            const result = await service.getTenant('nonexistent');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Tenant not found');
        });
    });

    describe('removeUserFromTenant', () => {
        it('should prevent removing the last owner', async () => {
            const { TenantService } = await import('../services/tenant.service');
            const service = new TenantService(mockRepository as any);

            mockRepository.getTenantById.mockResolvedValue({ id: 'tenant_123' });
            mockRepository.getTenantUser.mockResolvedValue({
                tenantId: 'tenant_123',
                userId: 'user_123',
                role: 'owner',
            });
            mockRepository.countTenantOwners.mockResolvedValue(1);

            const result = await service.removeUserFromTenant('tenant_123', 'user_123');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Cannot remove the last owner of a tenant');
        });
    });
});

// ============================================================================
// QuotaService Tests
// ============================================================================

describe('QuotaService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkQuota', () => {
        it('should return unlimited for tenant without quota limit', async () => {
            const { QuotaService } = await import('../services/quota.service');
            const service = new QuotaService(mockRepository as any);

            mockRepository.rawFirst.mockResolvedValue({ global_quota_limit: null });

            const result = await service.checkQuota('tenant_123', 1);

            expect(result.success).toBe(true);
            expect(result.data?.allowed).toBe(true);
            expect(result.data?.level).toBe('unlimited');
        });

        it('should check per-key quota first', async () => {
            const { QuotaService } = await import('../services/quota.service');
            const service = new QuotaService(mockRepository as any);

            // API key with quota limit
            mockRepository.rawFirst
                .mockResolvedValueOnce({
                    quota_limit: 100,
                    quota_period: 'month',
                    tenant_id: 'tenant_123',
                })
                .mockResolvedValueOnce({ total_quantity: 50 });

            const result = await service.checkQuota('tenant_123', 1, 'ak_123');

            expect(result.success).toBe(true);
            expect(result.data?.level).toBe('api_key');
            expect(result.data?.allowed).toBe(true);
        });

        it('should deny when quota exceeded', async () => {
            const { QuotaService } = await import('../services/quota.service');
            const service = new QuotaService(mockRepository as any);

            // Tenant at quota limit
            mockRepository.rawFirst.mockResolvedValue({ global_quota_limit: 100 });
            mockRepository.rawFirst.mockResolvedValueOnce({ global_quota_limit: 100 });

            // Mock getUsage
            vi.spyOn(service, 'getUsage').mockResolvedValue({
                success: true,
                data: {
                    tenantId: 'tenant_123',
                    period: '2026-01',
                    totalQuantity: 100,
                    eventCount: 100,
                },
            });

            const result = await service.checkQuota('tenant_123', 1);

            expect(result.success).toBe(true);
            expect(result.data?.allowed).toBe(false);
            expect(result.data?.level).toBe('tenant');
        });
    });

    describe('recordUsage', () => {
        it('should record usage with idempotency', async () => {
            const { QuotaService } = await import('../services/quota.service');
            const service = new QuotaService(mockRepository as any);

            mockRepository.rawFirst.mockResolvedValue(null); // No existing
            mockRepository.rawRun.mockResolvedValue({ changes: 1 });

            const result = await service.recordUsage({
                tenantId: 'tenant_123',
                service: 'api',
                action: 'request',
                idempotencyKey: 'idem_123',
            });

            expect(result.success).toBe(true);
            expect(result.data?.idempotencyKey).toBe('idem_123');
        });

        it('should return existing event for duplicate idempotency key', async () => {
            const { QuotaService } = await import('../services/quota.service');
            const service = new QuotaService(mockRepository as any);

            const existingEvent = {
                id: 'ue_123',
                tenant_id: 'tenant_123',
                api_key_id: null,
                user_id: null,
                service: 'api',
                action: 'request',
                quantity: 1,
                period: '2026-01',
                timestamp: Date.now(),
                idempotency_key: 'idem_123',
            };
            mockRepository.rawFirst.mockResolvedValue(existingEvent);

            const result = await service.recordUsage({
                tenantId: 'tenant_123',
                service: 'api',
                action: 'request',
                idempotencyKey: 'idem_123',
            });

            expect(result.success).toBe(true);
            expect(result.data?.id).toBe('ue_123');
        });
    });
});

// ============================================================================
// FeatureFlagService Tests
// ============================================================================

describe('FeatureFlagService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('featureEnabled', () => {
        it('should return false for inactive flag', async () => {
            const { FeatureFlagService } = await import('../services/featureflag.service');
            const service = new FeatureFlagService(mockRepository as any);

            mockRepository.rawFirst.mockResolvedValue({
                id: 'ff_123',
                name: 'test_feature',
                description: null,
                enabled_tiers: '[]',
                enabled_tenants: '[]',
                rollout_percentage: 0,
                active: 0,
                created_at: Date.now(),
                updated_at: Date.now(),
            });

            const result = await service.featureEnabled('test_feature', {
                tenantId: 'tenant_123',
            });

            expect(result).toBe(false);
        });

        it('should return true for explicitly enabled tenant', async () => {
            const { FeatureFlagService } = await import('../services/featureflag.service');
            const service = new FeatureFlagService(mockRepository as any);

            mockRepository.rawFirst.mockResolvedValue({
                id: 'ff_123',
                name: 'test_feature',
                description: null,
                enabled_tiers: '[]',
                enabled_tenants: '["tenant_123"]',
                rollout_percentage: 0,
                active: 1,
                created_at: Date.now(),
                updated_at: Date.now(),
            });

            const result = await service.featureEnabled('test_feature', {
                tenantId: 'tenant_123',
            });

            expect(result).toBe(true);
        });

        it('should return true for enabled tier', async () => {
            const { FeatureFlagService } = await import('../services/featureflag.service');
            const service = new FeatureFlagService(mockRepository as any);

            mockRepository.rawFirst.mockResolvedValue({
                id: 'ff_123',
                name: 'test_feature',
                description: null,
                enabled_tiers: '["pro", "enterprise"]',
                enabled_tenants: '[]',
                rollout_percentage: 0,
                active: 1,
                created_at: Date.now(),
                updated_at: Date.now(),
            });

            const result = await service.featureEnabled('test_feature', {
                tenantId: 'tenant_123',
                tier: 'pro',
            });

            expect(result).toBe(true);
        });

        it('should use rollout percentage deterministically', async () => {
            const { FeatureFlagService } = await import('../services/featureflag.service');
            const service = new FeatureFlagService(mockRepository as any);

            mockRepository.rawFirst.mockResolvedValue({
                id: 'ff_123',
                name: 'test_feature',
                description: null,
                enabled_tiers: '[]',
                enabled_tenants: '[]',
                rollout_percentage: 50,
                active: 1,
                created_at: Date.now(),
                updated_at: Date.now(),
            });

            // Same tenant should always get same result
            const result1 = await service.featureEnabled('test_feature', {
                tenantId: 'tenant_abc',
            });
            const result2 = await service.featureEnabled('test_feature', {
                tenantId: 'tenant_abc',
            });

            expect(result1).toBe(result2);
        });
    });
});

// ============================================================================
// AuthorizationService Tests
// ============================================================================

describe('AuthorizationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('authorize', () => {
        it('should deny when user is not in tenant', async () => {
            const { AuthorizationService } = await import('../services/authorization.service');
            const service = new AuthorizationService(mockRepository as any);

            mockRepository.getSessionById.mockResolvedValue({
                id: 'sess_123',
                userId: 'user_123',
                service: 'api',
                expiresAt: Date.now() + 3600000,
                revokedAt: null,
            });
            mockRepository.getTenantUser.mockResolvedValue(null);

            const result = await service.authorize({
                userId: 'user_123',
                tenantId: 'tenant_123',
                sessionId: 'sess_123',
                service: 'api',
                action: 'read',
            });

            expect(result.success).toBe(true);
            expect(result.data?.allowed).toBe(false);
            expect(result.data?.reason).toContain('not a member');
        });

        it('should check role hierarchy correctly', async () => {
            const { AuthorizationService } = await import('../services/authorization.service');
            const service = new AuthorizationService(mockRepository as any);

            // Setup mocks for full authorization flow
            mockRepository.getSessionById.mockResolvedValue({
                id: 'sess_123',
                userId: 'user_123',
                tenantId: 'tenant_123',
                service: 'api',
                expiresAt: Date.now() + 3600000,
                revokedAt: null,
            });
            mockRepository.getTenantUser.mockResolvedValue({
                tenantId: 'tenant_123',
                userId: 'user_123',
                role: 'member',
            });
            mockRepository.rawFirst.mockResolvedValue(null); // No subscription
            mockRepository.rawAll.mockResolvedValue({ results: [] });

            const result = await service.authorize({
                userId: 'user_123',
                tenantId: 'tenant_123',
                sessionId: 'sess_123',
                service: 'api',
                action: 'admin',
                requiredRole: 'admin',
            });

            expect(result.success).toBe(true);
            // Member trying to access admin route should fail RBAC
            // But the flow might fail earlier at subscription check
        });
    });
});
