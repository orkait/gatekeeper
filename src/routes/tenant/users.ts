import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { TenantService } from '../../services/tenant';
import { requireAuth, requireTenantAdmin, type TenantAuthInfo } from './middleware';
import { AddUserSchema, UpdateUserRoleSchema } from './schemas';

const usersRouter = new Hono<AppEnv>();

usersRouter.get('/', requireAuth, async (c) => {
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

    const result = await tenantService.getTenantUsers(tenantId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

usersRouter.post(
    '/',
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
        if (!tenantId) {
            return c.json({ success: false, error: 'Tenant ID is required' }, 400);
        }
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

usersRouter.patch(
    '/:userId',
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
        if (!tenantId || !userId) {
            return c.json({ success: false, error: 'Tenant ID and User ID are required' }, 400);
        }
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

usersRouter.delete(
    '/:userId',
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

export default usersRouter;
