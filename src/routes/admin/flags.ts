import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { FeatureFlagService } from '../../services/featureflag';
import { requireAdmin } from './middleware';
import { CreateFeatureFlagSchema, UpdateFeatureFlagSchema } from './schemas';

const flagsRouter = new Hono<AppEnv>();

flagsRouter.get('/', requireAdmin, async (c) => {
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

flagsRouter.get('/:id', requireAdmin, async (c) => {
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

flagsRouter.post(
    '/',
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

flagsRouter.patch(
    '/:id',
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

flagsRouter.delete('/:id', requireAdmin, async (c) => {
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

flagsRouter.post('/:id/toggle', requireAdmin, async (c) => {
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

export default flagsRouter;
