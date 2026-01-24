import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../env';
import { getEnv } from '../env';
import { AuthRepository } from '../repositories/auth.repository';
import { createAuthDB } from '../utils/db';
import { TenantService } from '../services/tenant.service';
import { JWTService } from '../services/jwt.service';
import {
    CreateTenantSchema,
    UpdateTenantSchema,
    TenantRoleSchema,
} from '../schemas/tenant.schema';

const tenantRoutes = new Hono<AppEnv>();

// ============================================================================
// Schemas
// ============================================================================

const AddUserSchema = z.object({
    userId: z.string().min(1),
    role: TenantRoleSchema,
});

const UpdateUserRoleSchema = z.object({
    role: TenantRoleSchema,
});

// ============================================================================
// Middleware
// ============================================================================

/**
 * JWT auth info from token.
 */
interface AuthInfo {
    userId: string;
    tenantId?: string;
}

/**
 * Verify JWT and extract user info.
 */
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

    const auth: AuthInfo = {
        userId: result.payload.sub,
        tenantId: result.payload.tenant_id as string | undefined,
    };

    c.set('auth', auth);
    await next();
}

/**
 * Verify user is admin or owner of the tenant.
 */
async function requireTenantAdmin(c: any, next: any) {
    const env = getEnv(c.env);
    const auth = c.get('auth') as AuthInfo;
    const tenantId = c.req.param('id');

    if (!tenantId) {
        return c.json({ success: false, error: 'Tenant ID required' }, 400);
    }

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantUser = await repository.getTenantUser(tenantId, auth.userId);

    if (!tenantUser || (tenantUser.role !== 'admin' && tenantUser.role !== 'owner')) {
        return c.json({ success: false, error: 'Admin or owner access required' }, 403);
    }

    c.set('tenantRole', tenantUser.role);
    await next();
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/tenants
 * Create a new tenant with the current user as owner.
 */
tenantRoutes.post(
    '/',
    requireAuth,
    zValidator('json', CreateTenantSchema, (result, c) => {
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
        const tenantService = new TenantService(repository);

        const result = await tenantService.createTenant(body, auth.userId);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

/**
 * GET /api/tenants/:id
 * Get tenant details. Must be a member of the tenant.
 */
tenantRoutes.get('/:id', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as AuthInfo;
    const tenantId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantService = new TenantService(repository);

    // Check membership
    const tenantUser = await repository.getTenantUser(tenantId, auth.userId);
    if (!tenantUser) {
        return c.json({ success: false, error: 'Tenant not found or access denied' }, 404);
    }

    const result = await tenantService.getTenant(tenantId);

    if (!result.success || !result.data) {
        return c.json({ success: false, error: result.error || 'Tenant not found' }, 404);
    }

    return c.json({ success: true, data: result.data });
});

/**
 * PATCH /api/tenants/:id
 * Update tenant. Requires admin or owner role.
 */
tenantRoutes.patch(
    '/:id',
    requireAuth,
    requireTenantAdmin,
    zValidator('json', UpdateTenantSchema, (result, c) => {
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
        const tenantId = c.req.param('id');
        const body = c.req.valid('json');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const tenantService = new TenantService(repository);

        const result = await tenantService.updateTenant(tenantId, body);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data });
    }
);

/**
 * DELETE /api/tenants/:id
 * Delete tenant. Requires owner role.
 */
tenantRoutes.delete('/:id', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as AuthInfo;
    const tenantId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantService = new TenantService(repository);

    // Check ownership
    const tenantUser = await repository.getTenantUser(tenantId, auth.userId);
    if (!tenantUser || tenantUser.role !== 'owner') {
        return c.json({ success: false, error: 'Owner access required' }, 403);
    }

    const result = await tenantService.deleteTenant(tenantId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, message: 'Tenant deleted' });
});

// ============================================================================
// User Management Routes
// ============================================================================

/**
 * GET /api/tenants/:id/users
 * List all users in the tenant. Requires membership.
 */
tenantRoutes.get('/:id/users', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as AuthInfo;
    const tenantId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantService = new TenantService(repository);

    // Check membership
    const tenantUser = await repository.getTenantUser(tenantId, auth.userId);
    if (!tenantUser) {
        return c.json({ success: false, error: 'Tenant not found or access denied' }, 404);
    }

    const result = await tenantService.getTenantUsers(tenantId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

/**
 * POST /api/tenants/:id/users
 * Add a user to the tenant. Requires admin or owner role.
 */
tenantRoutes.post(
    '/:id/users',
    requireAuth,
    requireTenantAdmin,
    zValidator('json', AddUserSchema, (result, c) => {
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
        const tenantId = c.req.param('id');
        const body = c.req.valid('json');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const tenantService = new TenantService(repository);

        const result = await tenantService.addUserToTenant({
            tenantId,
            userId: body.userId,
            role: body.role,
        });

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

/**
 * PATCH /api/tenants/:id/users/:userId
 * Update a user's role. Requires admin or owner role.
 */
tenantRoutes.patch(
    '/:id/users/:userId',
    requireAuth,
    requireTenantAdmin,
    zValidator('json', UpdateUserRoleSchema, (result, c) => {
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
        const tenantId = c.req.param('id');
        const userId = c.req.param('userId');
        const body = c.req.valid('json');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const tenantService = new TenantService(repository);

        const result = await tenantService.updateTenantUserRole({
            tenantId,
            userId,
            role: body.role,
        });

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data });
    }
);

/**
 * DELETE /api/tenants/:id/users/:userId
 * Remove a user from the tenant. Requires admin or owner role.
 */
tenantRoutes.delete(
    '/:id/users/:userId',
    requireAuth,
    requireTenantAdmin,
    async (c) => {
        const env = getEnv(c.env);
        const tenantId = c.req.param('id');
        const userId = c.req.param('userId');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const tenantService = new TenantService(repository);

        const result = await tenantService.removeUserFromTenant(tenantId, userId);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, message: 'User removed from tenant' });
    }
);

/**
 * GET /api/tenants/me
 * List all tenants the current user belongs to.
 */
tenantRoutes.get('/me/list', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as AuthInfo;

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantService = new TenantService(repository);

    const result = await tenantService.getUserTenants(auth.userId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

export default tenantRoutes;
