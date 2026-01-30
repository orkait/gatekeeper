import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { TenantService } from '../../services/tenant';
import { requireTenantAdmin, requireTenantMember } from '../../middleware/auth-domain/tenant';
import { AddUserSchema, UpdateUserRoleSchema } from './schemas';

const usersRouter = new Hono<AppEnv>();

usersRouter.get('/', requireTenantMember, async (c) => {
    const tenantId = c.req.param('id');
    if (!tenantId) {
        throw new HTTPException(400, { message: 'Tenant ID is required' });
    }

    const repository = c.get('authRepository');
    const tenantService = new TenantService(repository);

    const result = await tenantService.getTenantUsers(tenantId);

    if (!result.success) {
        throw new HTTPException(500, { message: result.error || 'Failed to load tenant users' });
    }

    return c.json({ success: true, data: result.data });
});

usersRouter.post(
    '/',
    requireTenantAdmin,
    zValidator('json', AddUserSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const tenantId = c.req.param('id');
        if (!tenantId) {
            throw new HTTPException(400, { message: 'Tenant ID is required' });
        }
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const tenantService = new TenantService(repository);

        const result = await tenantService.addUserToTenant({
            tenantId,
            userId: body.userId,
            role: body.role,
        });

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Failed to add user' });
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

usersRouter.patch(
    '/:userId',
    requireTenantAdmin,
    zValidator('json', UpdateUserRoleSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const tenantId = c.req.param('id');
        if (!tenantId) {
            throw new HTTPException(400, { message: 'Tenant ID is required' });
        }
        const userId = c.req.param('userId');
        if (!userId) {
            throw new HTTPException(400, { message: 'User ID is required' });
        }
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const tenantService = new TenantService(repository);

        const result = await tenantService.updateTenantUserRole({
            tenantId,
            userId,
            role: body.role,
        });

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Failed to update user role' });
        }

        return c.json({ success: true, data: result.data });
    }
);

usersRouter.delete(
    '/:userId',
    requireTenantAdmin,
    async (c) => {
        const tenantId = c.req.param('id');
        if (!tenantId) {
            throw new HTTPException(400, { message: 'Tenant ID is required' });
        }
        const userId = c.req.param('userId');
        if (!userId) {
            throw new HTTPException(400, { message: 'User ID is required' });
        }

        const repository = c.get('authRepository');
        const tenantService = new TenantService(repository);

        const result = await tenantService.removeUserFromTenant(tenantId, userId);

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Failed to remove user' });
        }

        return c.json({ success: true, message: 'User removed from tenant' });
    }
);

export default usersRouter;
