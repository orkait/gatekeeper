import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { TenantService } from '../../services/tenant';
import { requireTenantAdmin, requireTenantMember, requireTenantOwner } from '../../middleware/auth-domain/tenant';
import { authMiddleware, getAuth } from '../../middleware/auth-domain/core';
import { CreateTenantSchema, UpdateTenantSchema } from './schemas';

const crudRouter = new Hono<AppEnv>();

crudRouter.post(
    '/',
    authMiddleware,
    zValidator('json', CreateTenantSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
            const auth = getAuth(c);
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const tenantService = new TenantService(repository);

        const result = await tenantService.createTenant(body, auth.userId);

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Tenant create failed' });
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

// ROUTE ORDER FIX: /me/list must come BEFORE /:id to avoid 'me' being captured as a tenant ID
crudRouter.get('/me/list', authMiddleware, async (c) => {
    const auth = getAuth(c);

    const repository = c.get('authRepository');
    const tenantService = new TenantService(repository);

    const result = await tenantService.getUserTenants(auth.userId);

    if (!result.success) {
        throw new HTTPException(500, { message: result.error || 'Failed to load tenants' });
    }

    return c.json({ success: true, data: result.data });
});

crudRouter.get('/:id', requireTenantMember, async (c) => {
    const tenantId = c.req.param('id');

    const repository = c.get('authRepository');
    const tenantService = new TenantService(repository);

    const result = await tenantService.getTenant(tenantId);

    if (!result.success || !result.data) {
        throw new HTTPException(404, { message: result.error || 'Tenant not found' });
    }

    return c.json({ success: true, data: result.data });
});

crudRouter.patch(
    '/:id',
    requireTenantAdmin,
    zValidator('json', UpdateTenantSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
            const tenantId = c.req.param('id');
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const tenantService = new TenantService(repository);

        const result = await tenantService.updateTenant(tenantId, body);

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Tenant update failed' });
        }

        return c.json({ success: true, data: result.data });
    }
);

crudRouter.delete('/:id', requireTenantOwner, async (c) => {
    const tenantId = c.req.param('id');

    const repository = c.get('authRepository');
    const tenantService = new TenantService(repository);

    const result = await tenantService.deleteTenant(tenantId);

    if (!result.success) {
        throw new HTTPException(400, { message: result.error || 'Tenant delete failed' });
    }

    return c.json({ success: true, message: 'Tenant deleted' });
});

// NOTE: /me/list route moved above /:id route to fix path conflict

export default crudRouter;
