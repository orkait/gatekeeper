import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { OverrideService } from '../../services/override';
import { requireAdmin, type AdminAuthInfo } from './middleware';
import { CreateOverrideSchema } from './schemas';

const overridesRouter = new Hono<AppEnv>();

overridesRouter.get('/', requireAdmin, async (c) => {
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

    return c.json({ success: true, data: [], message: 'Provide tenantId query param' });
});

overridesRouter.get('/:tenantId/active', requireAdmin, async (c) => {
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

overridesRouter.post(
    '/',
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
        const auth = c.get('auth') as AdminAuthInfo;
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

overridesRouter.get('/detail/:id', requireAdmin, async (c) => {
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

overridesRouter.delete('/:id', requireAdmin, async (c) => {
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

overridesRouter.post('/:id/expire', requireAdmin, async (c) => {
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

export default overridesRouter;
