import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { OverrideService } from '../../services/override';
import { requireAdmin, type AdminAuthInfo } from '../../middleware/auth-domain/admin';
import { CreateOverrideSchema } from './schemas';

const overridesRouter = new Hono<AppEnv>();

overridesRouter.get('/', requireAdmin, async (c) => {
    const tenantId = c.req.query('tenantId');

    const repository = c.get('authRepository');
    const overrideService = new OverrideService(repository);

    if (tenantId) {
        const result = await overrideService.listOverrides(tenantId);
        if (!result.success) {
            throw new HTTPException(500, { message: result.error || 'Failed to load overrides' });
        }
        return c.json({ success: true, data: result.data });
    }

    return c.json({ success: true, data: [], message: 'Provide tenantId query param' });
});

overridesRouter.get('/:tenantId/active', requireAdmin, async (c) => {
    const tenantId = c.req.param('tenantId');

    const repository = c.get('authRepository');
    const overrideService = new OverrideService(repository);

    const result = await overrideService.getActiveOverrides(tenantId);

    if (!result.success) {
        throw new HTTPException(500, { message: result.error || 'Failed to load active overrides' });
    }

    return c.json({ success: true, data: result.data });
});

overridesRouter.post(
    '/',
    requireAdmin,
    zValidator('json', CreateOverrideSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const auth = c.get('auth') as unknown as AdminAuthInfo;
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const overrideService = new OverrideService(repository);

        const result = await overrideService.createOverride({
            tenantId: body.tenantId,
            type: body.type,
            value: body.value,
            reason: body.reason,
            grantedBy: auth?.userId ?? '',
            expiresInSeconds: body.expiresInSeconds,
        });

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Override create failed' });
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

overridesRouter.get('/detail/:id', requireAdmin, async (c) => {
    const overrideId = c.req.param('id');

    const repository = c.get('authRepository');
    const overrideService = new OverrideService(repository);

    const result = await overrideService.getOverride(overrideId);

    if (!result.success || !result.data) {
        throw new HTTPException(404, { message: result.error || 'Override not found' });
    }

    return c.json({ success: true, data: result.data });
});

overridesRouter.delete('/:id', requireAdmin, async (c) => {
    const overrideId = c.req.param('id');

    const repository = c.get('authRepository');
    const overrideService = new OverrideService(repository);

    const result = await overrideService.deleteOverride(overrideId);

    if (!result.success) {
        throw new HTTPException(400, { message: result.error || 'Override delete failed' });
    }

    return c.json({ success: true, message: 'Override deleted' });
});

overridesRouter.post('/:id/expire', requireAdmin, async (c) => {
    const overrideId = c.req.param('id');

    const repository = c.get('authRepository');
    const overrideService = new OverrideService(repository);

    const result = await overrideService.expireOverride(overrideId);

    if (!result.success) {
        throw new HTTPException(400, { message: result.error || 'Override expire failed' });
    }

    return c.json({ success: true, data: result.data });
});

export default overridesRouter;
