import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { FeatureFlagService } from '../../services/featureflag';
import { requireAdmin } from '../../middleware/auth-domain/admin';
import { CreateFeatureFlagSchema, UpdateFeatureFlagSchema } from './schemas';

const flagsRouter = new Hono<AppEnv>();

flagsRouter.get('/', requireAdmin, async (c) => {
    const activeOnly = c.req.query('active') === 'true';

    const repository = c.get('authRepository');
    const flagService = new FeatureFlagService(repository);

    const result = await flagService.listFeatureFlags(activeOnly);

    if (!result.success) {
        throw new HTTPException(500, { message: result.error || 'Failed to load feature flags' });
    }

    return c.json({ success: true, data: result.data });
});

flagsRouter.get('/:id', requireAdmin, async (c) => {
    const flagId = c.req.param('id');

    const repository = c.get('authRepository');
    const flagService = new FeatureFlagService(repository);

    const result = await flagService.getFeatureFlag(flagId);

    if (!result.success || !result.data) {
        throw new HTTPException(404, { message: result.error || 'Feature flag not found' });
    }

    return c.json({ success: true, data: result.data });
});

flagsRouter.post(
    '/',
    requireAdmin,
    zValidator('json', CreateFeatureFlagSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const flagService = new FeatureFlagService(repository);

        const result = await flagService.createFeatureFlag(body);

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Feature flag create failed' });
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

flagsRouter.patch(
    '/:id',
    requireAdmin,
    zValidator('json', UpdateFeatureFlagSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const flagId = c.req.param('id');
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const flagService = new FeatureFlagService(repository);

        const result = await flagService.updateFeatureFlag(flagId, body);

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Feature flag update failed' });
        }

        return c.json({ success: true, data: result.data });
    }
);

flagsRouter.delete('/:id', requireAdmin, async (c) => {
    const flagId = c.req.param('id');

    const repository = c.get('authRepository');
    const flagService = new FeatureFlagService(repository);

    const result = await flagService.deleteFeatureFlag(flagId);

    if (!result.success) {
        throw new HTTPException(400, { message: result.error || 'Feature flag delete failed' });
    }

    return c.json({ success: true, message: 'Feature flag deleted' });
});

flagsRouter.post('/:id/toggle', requireAdmin, async (c) => {
    const flagId = c.req.param('id');

    const repository = c.get('authRepository');
    const flagService = new FeatureFlagService(repository);

    const result = await flagService.toggleFeatureFlag(flagId);

    if (!result.success) {
        throw new HTTPException(400, { message: result.error || 'Feature flag toggle failed' });
    }

    return c.json({ success: true, data: result.data });
});

export default flagsRouter;
