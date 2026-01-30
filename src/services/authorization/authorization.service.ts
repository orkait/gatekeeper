import type { AuthRepository, TenantRole } from '../../repositories';
import type { ServiceResult } from '../../types';
import type { AuthCache } from '../../utils/cache';
import { buildCacheKey, CacheKeyPrefix, AUTH_CACHE_TTL_SECONDS } from '../../utils/cache';
import { QuotaService, type QuotaCheckResult } from '../quota';
import { SubscriptionService, type SubscriptionTier } from '../subscription';
import { FeatureFlagService } from '../featureflag';
import { OverrideService, type ParsedOverrides } from '../override';
import { nowMs } from '../shared';
import { logger } from '../../utils/logger';
import { 
    type AuthorizeContext, 
    type AuthorizeResult, 
    type AuthorizeMetadata, 
    type AuthorizeChecks, 
    DenyReason 
} from './types';

// AuthorizationService - Central authorization decisions.
// Checks in order:
// 1. Session validity
// 2. Subscription status
// 3. Service enablement
// 4. Feature flags
// 5. Quota limits
// 6. RBAC (role-based access)
// 7. Admin overrides (can bypass some checks)
// Uses strong consistency for all reads and caches decisions in KV.
export class AuthorizationService {
    private quotaService: QuotaService;
    private subscriptionService: SubscriptionService;
    private featureFlagService: FeatureFlagService;
    private overrideService: OverrideService;

    constructor(
        private repository: AuthRepository,
        private cache?: AuthCache
    ) {
        this.quotaService = new QuotaService(repository);
        this.subscriptionService = new SubscriptionService(repository);
        this.featureFlagService = new FeatureFlagService(repository);
        this.overrideService = new OverrideService(repository);
    }

    // Checks authorization in order and returns decision with metadata.
    // Results are cached in KV for performance.
    async authorize(ctx: AuthorizeContext): Promise<ServiceResult<AuthorizeResult>> {
        const cacheKey = this.buildAuthCacheKey(ctx);

        // Try cache first if available
        if (this.cache) {
            const cached = await this.cache.get<AuthorizeResult>(cacheKey);
            if (cached) {
                return {
                    success: true,
                    data: {
                        ...cached.data,
                        metadata: {
                            ...cached.data.metadata,
                            degraded: true,
                        },
                    },
                };
            }
        }

        // Perform authorization checks
        const result = await this.performAuthorization(ctx);

        // Cache successful decisions
        if (this.cache && result.success && result.data) {
            await this.cache.set(cacheKey, result.data, AUTH_CACHE_TTL_SECONDS);
        }

        return result;
    }

    private async performAuthorization(ctx: AuthorizeContext): Promise<ServiceResult<AuthorizeResult>> {
        const checks: AuthorizeChecks = {
            session: false,
            subscription: false,
            serviceEnabled: false,
            feature: false,
            quota: false,
            rbac: false,
            override: false,
        };

        const metadata: AuthorizeMetadata = { checks };

        try {
            // 1. Check session validity
            if (ctx.sessionId) {
                const sessionCheck = await this.checkSession(ctx.sessionId, ctx.userId, ctx.service);
                if (!sessionCheck.valid) {
                    return this.deny(sessionCheck.reason || DenyReason.SESSION_INVALID, metadata);
                }
            }
            checks.session = true;

            // 2. Check tenant membership and get role
            const membershipCheck = await this.checkTenantMembership(ctx.tenantId, ctx.userId);
            if (!membershipCheck.valid) {
                return this.deny(DenyReason.USER_NOT_IN_TENANT, metadata);
            }
            metadata.role = membershipCheck.role;

            // Get overrides early (they may affect other checks)
            const overridesResult = await this.overrideService.getParsedOverrides(ctx.tenantId);
            if (overridesResult.success && overridesResult.data) {
                metadata.overrides = overridesResult.data;
                checks.override = true;
            }

            // 3. Check subscription status
            const subscriptionCheck = await this.checkSubscription(ctx.tenantId, metadata.overrides);
            if (!subscriptionCheck.valid) {
                return this.deny(subscriptionCheck.reason || DenyReason.SUBSCRIPTION_INACTIVE, metadata);
            }
            metadata.tier = subscriptionCheck.tier;
            checks.subscription = true;

            // 4. Check service enablement
            if (subscriptionCheck.subscriptionId) {
                const serviceCheck = await this.checkServiceEnabled(
                    subscriptionCheck.subscriptionId,
                    ctx.service
                );
                if (!serviceCheck.valid) {
                    return this.deny(DenyReason.SERVICE_DISABLED, metadata);
                }
            }
            checks.serviceEnabled = true;

            // 5. Check feature flag (if required)
            if (ctx.requiredFeature) {
                const featureCheck = await this.checkFeature(
                    ctx.requiredFeature,
                    ctx.tenantId,
                    metadata.tier,
                    metadata.overrides
                );
                if (!featureCheck.valid) {
                    return this.deny(DenyReason.FEATURE_DISABLED, metadata);
                }
            }
            checks.feature = true;

            // 6. Check quota
            const quotaCheck = await this.checkQuota(
                ctx.tenantId,
                ctx.quantity ?? 1,
                ctx.apiKeyId,
                metadata.overrides
            );
            if (!quotaCheck.valid) {
                metadata.quota = quotaCheck.result;
                return this.deny(DenyReason.QUOTA_EXCEEDED, metadata);
            }
            metadata.quota = quotaCheck.result;
            checks.quota = true;

            // 7. Check RBAC (if required role specified)
            if (ctx.requiredRole) {
                const rbacCheck = this.checkRole(metadata.role!, ctx.requiredRole);
                if (!rbacCheck.valid) {
                    return this.deny(DenyReason.INSUFFICIENT_ROLE, metadata);
                }
            }
            checks.rbac = true;

            // All checks passed
            return this.allow(metadata);

        } catch (error) {
            logger.error('Authorization error', error);
            return this.deny(DenyReason.INTERNAL_ERROR, metadata);
        }
    }

    // ========================================================================
    // Individual Check Methods
    // ========================================================================


    private async checkSession(
        sessionId: string,
        userId: string,
        service: string
    ): Promise<{ valid: boolean; reason?: string }> {
        const session = await this.repository.getSessionById(sessionId);

        if (!session) {
            return { valid: false, reason: DenyReason.SESSION_INVALID };
        }

        if (session.revokedAt) {
            return { valid: false, reason: DenyReason.SESSION_REVOKED };
        }

        if (session.expiresAt < nowMs()) {
            return { valid: false, reason: DenyReason.SESSION_INVALID };
        }

        if (session.userId !== userId) {
            return { valid: false, reason: DenyReason.SESSION_INVALID };
        }

        // Session's service must match (or be a wildcard)
        if (session.service !== service && session.service !== '*') {
            return { valid: false, reason: DenyReason.SESSION_INVALID };
        }

        return { valid: true };
    }

    private async checkTenantMembership(
        tenantId: string,
        userId: string
    ): Promise<{ valid: boolean; role?: TenantRole }> {
        const tenantUser = await this.repository.getTenantUser(tenantId, userId);

        if (!tenantUser) {
            return { valid: false };
        }

        return { valid: true, role: tenantUser.role };
    }

    private async checkSubscription(
        tenantId: string,
        overrides?: ParsedOverrides
    ): Promise<{ valid: boolean; tier?: SubscriptionTier; subscriptionId?: string; reason?: string }> {
        const result = await this.subscriptionService.getSubscription(tenantId);

        if (!result.success || !result.data) {
            return { valid: false, reason: DenyReason.SUBSCRIPTION_NOT_FOUND };
        }

        const subscription = result.data;

        if (subscription.status !== 'active') {
            return { valid: false, reason: DenyReason.SUBSCRIPTION_INACTIVE };
        }

        // Apply tier upgrade override if present
        let tier = subscription.tier;
        if (overrides?.tierUpgrade) {
            const tierOrder: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
            const overrideTier = overrides.tierUpgrade as SubscriptionTier;
            const overrideLevel = tierOrder[overrideTier] ?? -1;
            const currentLevel = tierOrder[tier] ?? -1;
            if (overrideLevel > currentLevel) {
                tier = overrideTier;
            }
        }

        return { valid: true, tier, subscriptionId: subscription.id };
    }

    private async checkServiceEnabled(
        subscriptionId: string,
        service: string
    ): Promise<{ valid: boolean }> {
        // isServiceEnabled returns boolean directly
        const enabled = await this.subscriptionService.isServiceEnabled(subscriptionId, service);
        return { valid: enabled };
    }

    private async checkFeature(
        featureName: string,
        tenantId: string,
        tier?: SubscriptionTier,
        overrides?: ParsedOverrides
    ): Promise<{ valid: boolean }> {
        // Check if feature is granted via override
        if (overrides?.featureGrants.includes(featureName)) {
            return { valid: true };
        }

        // Check feature flag
        const enabled = await this.featureFlagService.featureEnabled(featureName, {
            tenantId,
            tier,
        });

        return { valid: enabled };
    }

    private async checkQuota(
        tenantId: string,
        quantity: number,
        apiKeyId?: string,
        overrides?: ParsedOverrides
    ): Promise<{ valid: boolean; result?: QuotaCheckResult }> {
        const result = await this.quotaService.checkQuota(tenantId, quantity, apiKeyId);

        if (!result.success || !result.data) {
            return { valid: false };
        }

        let quotaResult = result.data;

        // Apply quota boost override
        if (overrides?.quotaBoost && quotaResult.limit !== undefined) {
            const currentLimit = quotaResult.limit ?? 0;
            const currentUsed = quotaResult.used ?? 0;
            const boostedLimit = currentLimit + overrides.quotaBoost;
            const boostedRemaining = Math.max(0, boostedLimit - currentUsed);
            const allowed = currentUsed + quantity <= boostedLimit;

            quotaResult = {
                ...quotaResult,
                allowed,
                remaining: boostedRemaining,
                limit: boostedLimit,
                used: currentUsed, // Preserve used
                level: quotaResult.level, // Preserve level
            };
        }

        return { valid: quotaResult.allowed, result: quotaResult };
    }

    private checkRole(
        userRole: TenantRole,
        requiredRole: TenantRole
    ): { valid: boolean } {
        const roleHierarchy: Record<TenantRole, number> = {
            member: 0,
            admin: 1,
            owner: 2,
        };

        const userLevel = roleHierarchy[userRole];
        const requiredLevel = roleHierarchy[requiredRole];

        return { valid: userLevel >= requiredLevel };
    }

    // ========================================================================
    // Result Builders
    // ========================================================================

    private allow(metadata: AuthorizeMetadata): ServiceResult<AuthorizeResult> {
        return {
            success: true,
            data: {
                allowed: true,
                reason: 'Authorized',
                metadata,
            },
        };
    }

    private deny(reason: string, metadata: AuthorizeMetadata): ServiceResult<AuthorizeResult> {
        return {
            success: true,
            data: {
                allowed: false,
                reason,
                metadata,
            },
        };
    }

    private buildAuthCacheKey(ctx: AuthorizeContext): string {
        return buildCacheKey(
            CacheKeyPrefix.AUTH_DECISION,
            ctx.tenantId,
            ctx.userId,
            ctx.service,
            ctx.action,
            ctx.resource || '_'
        );
    }
}

// Create an AuthorizationService instance.
export function createAuthorizationService(
    repository: AuthRepository,
    cache?: AuthCache
): AuthorizationService {
    return new AuthorizationService(repository, cache);
}
