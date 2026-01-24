import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../env';
import { getEnv } from '../env';
import { AuthRepository } from '../repositories/auth.repository';
import { createAuthDB } from '../utils/db';
import { FeatureFlagService } from '../services/featureflag.service';
import { OverrideService } from '../services/override.service';
import { JWTService } from '../services/jwt.service';

const adminRoutes = new Hono<AppEnv>();

// ============================================================================
// Schemas
// ============================================================================

const CreateFeatureFlagSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    enabledTiers: z.array(z.enum(['free', 'pro', 'enterprise'])).optional(),
    enabledTenants: z.array(z.string()).optional(),
    rolloutPercentage: z.number().int().min(0).max(100).optional(),
    active: z.boolean().optional(),
});

const UpdateFeatureFlagSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).nullable().optional(),
    enabledTiers: z.array(z.enum(['free', 'pro', 'enterprise'])).optional(),
    enabledTenants: z.array(z.string()).optional(),
    rolloutPercentage: z.number().int().min(0).max(100).optional(),
    active: z.boolean().optional(),
});

const CreateOverrideSchema = z.object({
    tenantId: z.string().min(1),
    type: z.enum(['quota_boost', 'tier_upgrade', 'feature_grant']),
    value: z.string().min(1),
    reason: z.string().min(1).max(1000),
    expiresInSeconds: z.number().int().positive().optional(),
});

// ============================================================================
// Middleware
// ============================================================================

interface AuthInfo {
    userId: string;
    tenantId?: string;
    isAdmin?: boolean;
}

/**
 * Require admin authentication.
 * Admin is determined by internal secret or special admin role.
 */
async function requireAdmin(c: any, next: any) {
    const env = getEnv(c.env);
    
    // Check for internal secret (service-to-service)
    const internalSecret = c.req.header('X-Internal-Secret');
    if (internalSecret === env.internalSecret) {
        c.set('auth', { userId: 'system', isAdmin: true });
        await next();
        return;
    }

    // Check for JWT with admin claim
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ success: false, error: 'Admin authorization required' }, 401);
    }

    const token = authHeader.slice(7);
    const jwtService = new JWTService(env.jwtSecret);
    const result = await jwtService.verifyJWT(token);

    if (!result.valid || !result.payload) {
        return c.json({ success: false, error: result.error || 'Invalid token' }, 401);
    }

    // For now, check if user is owner of any tenant (simplified admin check)
    // In production, you'd have a separate admin table/flag
    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenants = await repository.getUserTenants(result.payload.sub);
    const isOwner = tenants.some(t => t.role === 'owner');

    if (!isOwner) {
        return c.json({ success: false, error: 'Admin access required' }, 403);
    }

    c.set('auth', {
        userId: result.payload.sub,
        tenantId: result.payload.tenant_id as string | undefined,
        isAdmin: true,
    });

    await next();
}

// ============================================================================
// Feature Flag Routes
// ============================================================================

/**
 * GET /api/admin/flags
 * List all feature flags.
 */
adminRoutes.get('/flags', requireAdmin, async (c) => {
    const env = getEnv(c.env);
    const activeOnly = c.req.query('active') === 'true';

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const flagService = new FeatureFlagService(repository);

    const result = await flagService.listFeatureFlags(activeOnly);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

/**
 * GET /api/admin/flags/:id
 * Get a specific feature flag.
 */
adminRoutes.get('/flags/:id', requireAdmin, async (c) => {
    const env = getEnv(c.env);
    const flagId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const flagService = new FeatureFlagService(repository);

    const result = await flagService.getFeatureFlag(flagId);

    if (!result.success || !result.data) {
        return c.json({ success: false, error: result.error || 'Feature flag not found' }, 404);
    }

    return c.json({ success: true, data: result.data });
});

/**
 * POST /api/admin/flags
 * Create a new feature flag.
 */
adminRoutes.post(
    '/flags',
    requireAdmin,
    zValidator('json', CreateFeatureFlagSchema, (result, c) => {
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
        const flagService = new FeatureFlagService(repository);

        const result = await flagService.createFeatureFlag(body);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

/**
 * PATCH /api/admin/flags/:id
 * Update a feature flag.
 */
adminRoutes.patch(
    '/flags/:id',
    requireAdmin,
    zValidator('json', UpdateFeatureFlagSchema, (result, c) => {
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
        const flagId = c.req.param('id');
        const body = c.req.valid('json');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const flagService = new FeatureFlagService(repository);

        const result = await flagService.updateFeatureFlag(flagId, body);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data });
    }
);

/**
 * DELETE /api/admin/flags/:id
 * Delete a feature flag.
 */
adminRoutes.delete('/flags/:id', requireAdmin, async (c) => {
    const env = getEnv(c.env);
    const flagId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const flagService = new FeatureFlagService(repository);

    const result = await flagService.deleteFeatureFlag(flagId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, message: 'Feature flag deleted' });
});

/**
 * POST /api/admin/flags/:id/toggle
 * Toggle a feature flag's active state.
 */
adminRoutes.post('/flags/:id/toggle', requireAdmin, async (c) => {
    const env = getEnv(c.env);
    const flagId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const flagService = new FeatureFlagService(repository);

    const result = await flagService.toggleFeatureFlag(flagId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, data: result.data });
});

// ============================================================================
// Override Routes
// ============================================================================

/**
 * GET /api/admin/overrides
 * List all overrides, optionally filtered by tenant.
 */
adminRoutes.get('/overrides', requireAdmin, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.query('tenantId');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const overrideService = new OverrideService(repository);

    if (tenantId) {
        const result = await overrideService.listOverrides(tenantId);
        if (!result.success) {
            return c.json({ success: false, error: result.error }, 500);
        }
        return c.json({ success: true, data: result.data });
    }

    // If no tenantId, return empty (or implement global list)
    return c.json({ success: true, data: [], message: 'Provide tenantId query param' });
});

/**
 * GET /api/admin/overrides/:tenantId/active
 * Get active overrides for a tenant.
 */
adminRoutes.get('/overrides/:tenantId/active', requireAdmin, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.param('tenantId');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const overrideService = new OverrideService(repository);

    const result = await overrideService.getActiveOverrides(tenantId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

/**
 * POST /api/admin/overrides
 * Create a new override.
 */
adminRoutes.post(
    '/overrides',
    requireAdmin,
    zValidator('json', CreateOverrideSchema, (result, c) => {
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
        const auth = c.get('auth') as AuthInfo;
        const body = c.req.valid('json');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const overrideService = new OverrideService(repository);

        const result = await overrideService.createOverride({
            tenantId: body.tenantId,
            type: body.type,
            value: body.value,
            reason: body.reason,
            grantedBy: auth.userId,
            expiresInSeconds: body.expiresInSeconds,
        });

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

/**
 * GET /api/admin/overrides/:id
 * Get a specific override.
 */
adminRoutes.get('/overrides/detail/:id', requireAdmin, async (c) => {
    const env = getEnv(c.env);
    const overrideId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const overrideService = new OverrideService(repository);

    const result = await overrideService.getOverride(overrideId);

    if (!result.success || !result.data) {
        return c.json({ success: false, error: result.error || 'Override not found' }, 404);
    }

    return c.json({ success: true, data: result.data });
});

/**
 * DELETE /api/admin/overrides/:id
 * Delete an override.
 */
adminRoutes.delete('/overrides/:id', requireAdmin, async (c) => {
    const env = getEnv(c.env);
    const overrideId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const overrideService = new OverrideService(repository);

    const result = await overrideService.deleteOverride(overrideId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, message: 'Override deleted' });
});

/**
 * POST /api/admin/overrides/:id/expire
 * Immediately expire an override.
 */
adminRoutes.post('/overrides/:id/expire', requireAdmin, async (c) => {
    const env = getEnv(c.env);
    const overrideId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const overrideService = new OverrideService(repository);

    const result = await overrideService.expireOverride(overrideId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, data: result.data });
});

export default adminRoutes;
