import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { TenantService } from '../../services/tenant';
import { requireAuth, requireTenantAdmin, type TenantAuthInfo } from './middleware';
import { CreateTenantSchema, UpdateTenantSchema } from './schemas';

const crudRouter = new Hono<AppEnv>();

crudRouter.post(
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
        const auth = c.get('auth') as TenantAuthInfo;
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

// ROUTE ORDER FIX: /me/list must come BEFORE /:id to avoid 'me' being captured as a tenant ID
crudRouter.get('/me/list', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as TenantAuthInfo;

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantService = new TenantService(repository);

    const result = await tenantService.getUserTenants(auth.userId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

crudRouter.get('/:id', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as TenantAuthInfo;
    const tenantId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantService = new TenantService(repository);

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

crudRouter.patch(
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

crudRouter.delete('/:id', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as TenantAuthInfo;
    const tenantId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantService = new TenantService(repository);

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

// NOTE: /me/list route moved above /:id route to fix path conflict

export default crudRouter;
