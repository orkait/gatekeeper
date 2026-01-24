import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../env';
import { getEnv } from '../env';
import { AuthRepository } from '../repositories/auth.repository';
import { createAuthDB } from '../utils/db';
import { SubscriptionService } from '../services/subscription.service';
import { QuotaService } from '../services/quota.service';
import { JWTService } from '../services/jwt.service';

const subscriptionRoutes = new Hono<AppEnv>();

// ============================================================================
// Schemas
// ============================================================================

const UpgradeSubscriptionSchema = z.object({
    tier: z.enum(['free', 'pro', 'enterprise']),
});

const RecordUsageSchema = z.object({
    tenantId: z.string().min(1),
    apiKeyId: z.string().optional(),
    userId: z.string().optional(),
    service: z.string().min(1),
    action: z.string().min(1),
    quantity: z.number().int().positive().optional().default(1),
    idempotencyKey: z.string().min(1),
});

// ============================================================================
// Middleware
// ============================================================================

interface AuthInfo {
    userId: string;
    tenantId?: string;
}

async function requireAuth(c: any, next: any) {
    const env = getEnv(c.env);
    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ success: false, error: 'Missing authorization token' }, 401);
    }

    const token = authHeader.slice(7);
    const jwtService = new JWTService(env.jwtSecret);
    const result = await jwtService.verifyJWT(token);

    if (!result.valid || !result.payload) {
        return c.json({ success: false, error: result.error || 'Invalid token' }, 401);
    }

    c.set('auth', {
        userId: result.payload.sub,
        tenantId: result.payload.tenant_id as string | undefined,
    });

    await next();
}

async function requireTenantMember(c: any, next: any) {
    const env = getEnv(c.env);
    const auth = c.get('auth') as AuthInfo;
    const tenantId = c.req.param('tenantId');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantUser = await repository.getTenantUser(tenantId, auth.userId);

    if (!tenantUser) {
        return c.json({ success: false, error: 'Access denied' }, 403);
    }

    c.set('tenantRole', tenantUser.role);
    await next();
}

async function requireInternalAuth(c: any, next: any) {
    const env = getEnv(c.env);
    const internalSecret = c.req.header('X-Internal-Secret');

    if (!internalSecret || internalSecret !== env.internalSecret) {
        return c.json({ success: false, error: 'Invalid internal secret' }, 401);
    }

    await next();
}

// ============================================================================
// Subscription Routes
// ============================================================================

/**
 * GET /api/subscriptions/:tenantId
 * Get subscription details for a tenant.
 */
subscriptionRoutes.get('/:tenantId', requireAuth, requireTenantMember, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.param('tenantId');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const subscriptionService = new SubscriptionService(repository);

    const result = await subscriptionService.getSubscriptionWithItems(tenantId);

    if (!result.success || !result.data) {
        return c.json({ success: false, error: result.error || 'Subscription not found' }, 404);
    }

    return c.json({ success: true, data: result.data });
});

/**
 * POST /api/subscriptions/:tenantId/upgrade
 * Upgrade subscription tier. Requires admin/owner.
 */
subscriptionRoutes.post(
    '/:tenantId/upgrade',
    requireAuth,
    requireTenantMember,
    zValidator('json', UpgradeSubscriptionSchema, (result, c) => {
        if (!result.success) {
            return c.json({
                success: false,
                error: 'Validation failed',
                details: result.error.flatten(),
            }, 400);
        }
    }),
    async (c) => {
        const env = getEnv(c.env);
        const tenantId = c.req.param('tenantId');
        const tenantRole = c.get('tenantRole') as string;
        const body = c.req.valid('json');

        // Only admin/owner can upgrade
        if (tenantRole !== 'admin' && tenantRole !== 'owner') {
            return c.json({ success: false, error: 'Admin or owner access required' }, 403);
        }

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const subscriptionService = new SubscriptionService(repository);

        const result = await subscriptionService.upgradeTier(tenantId, body.tier);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data });
    }
);

/**
 * POST /api/subscriptions/:tenantId/downgrade
 * Downgrade subscription tier. Requires admin/owner.
 */
subscriptionRoutes.post(
    '/:tenantId/downgrade',
    requireAuth,
    requireTenantMember,
    zValidator('json', UpgradeSubscriptionSchema, (result, c) => {
        if (!result.success) {
            return c.json({
                success: false,
                error: 'Validation failed',
                details: result.error.flatten(),
            }, 400);
        }
    }),
    async (c) => {
        const env = getEnv(c.env);
        const tenantId = c.req.param('tenantId');
        const tenantRole = c.get('tenantRole') as string;
        const body = c.req.valid('json');

        if (tenantRole !== 'admin' && tenantRole !== 'owner') {
            return c.json({ success: false, error: 'Admin or owner access required' }, 403);
        }

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const subscriptionService = new SubscriptionService(repository);

        const result = await subscriptionService.downgradeTier(tenantId, body.tier);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data });
    }
);

// ============================================================================
// Usage Routes
// ============================================================================

/**
 * GET /api/usage/:tenantId
 * Get usage summary for a tenant.
 */
subscriptionRoutes.get('/usage/:tenantId', requireAuth, requireTenantMember, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.param('tenantId');
    const period = c.req.query('period');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const quotaService = new QuotaService(repository);

    const result = await quotaService.getUsage(tenantId, period);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

/**
 * GET /api/usage/:tenantId/events
 * Get usage events for a tenant.
 */
subscriptionRoutes.get('/usage/:tenantId/events', requireAuth, requireTenantMember, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.param('tenantId');
    const period = c.req.query('period');
    const service = c.req.query('service');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const quotaService = new QuotaService(repository);

    const result = await quotaService.getUsageEvents(tenantId, {
        period: period || undefined,
        service: service || undefined,
        limit,
        offset,
    });

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

/**
 * POST /api/usage/record
 * Record usage (internal endpoint).
 */
subscriptionRoutes.post(
    '/usage/record',
    requireInternalAuth,
    zValidator('json', RecordUsageSchema, (result, c) => {
        if (!result.success) {
            return c.json({
                success: false,
                error: 'Validation failed',
                details: result.error.flatten(),
            }, 400);
        }
    }),
    async (c) => {
        const env = getEnv(c.env);
        const body = c.req.valid('json');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const quotaService = new QuotaService(repository);

        // Check quota first, then record if allowed
        const result = await quotaService.checkAndRecordUsage({
            tenantId: body.tenantId,
            apiKeyId: body.apiKeyId,
            userId: body.userId,
            service: body.service,
            action: body.action,
            quantity: body.quantity,
            idempotencyKey: body.idempotencyKey,
        });

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        if (!result.data?.allowed) {
            return c.json({
                success: false,
                error: 'Quota exceeded',
                quota: result.data,
            }, 429);
        }

        return c.json({ success: true, data: result.data });
    }
);

/**
 * GET /api/usage/:tenantId/quota
 * Check current quota status for a tenant.
 */
subscriptionRoutes.get('/usage/:tenantId/quota', requireAuth, requireTenantMember, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.param('tenantId');
    const apiKeyId = c.req.query('apiKeyId');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const quotaService = new QuotaService(repository);

    const result = await quotaService.checkQuota(tenantId, 0, apiKeyId || undefined);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

export default subscriptionRoutes;
