import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { SubscriptionService } from '../../services/subscription';
import { requireAuth, requireTenantMember } from './middleware';
import { UpgradeSubscriptionSchema } from './schemas';

const handlersRouter = new Hono<AppEnv>();

handlersRouter.get('/:tenantId', requireAuth, requireTenantMember, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.param('tenantId');

    if (!tenantId) {
        return c.json({ success: false, error: 'Tenant ID is required' }, 400);
    }

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const subscriptionService = new SubscriptionService(repository);

    const result = await subscriptionService.getSubscriptionWithItems(tenantId);

    if (!result.success || !result.data) {
        return c.json({ success: false, error: result.error || 'Subscription not found' }, 404);
    }

    return c.json({ success: true, data: result.data });
});

handlersRouter.post(
    '/:tenantId/upgrade',
    requireAuth,
    requireTenantMember,
    zValidator('json', UpgradeSubscriptionSchema, (result, c) => {
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
        const tenantId = c.req.param('tenantId');
        const tenantRole = c.get('tenantRole') as string;
        const body = c.req.valid('json');

        if (!tenantId) {
            return c.json({ success: false, error: 'Tenant ID is required' }, 400);
        }

        if (tenantRole !== 'admin' && tenantRole !== 'owner') {
            return c.json({ success: false, error: 'Admin or owner access required' }, 403);
        }

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const subscriptionService = new SubscriptionService(repository);

        const result = await subscriptionService.upgradeTier(tenantId, body.tier);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data });
    }
);

handlersRouter.post(
    '/:tenantId/downgrade',
    requireAuth,
    requireTenantMember,
    zValidator('json', UpgradeSubscriptionSchema, (result, c) => {
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
        const tenantId = c.req.param('tenantId');
        const tenantRole = c.get('tenantRole') as string;
        const body = c.req.valid('json');

        if (!tenantId) {
            return c.json({ success: false, error: 'Tenant ID is required' }, 400);
        }

        if (tenantRole !== 'admin' && tenantRole !== 'owner') {
            return c.json({ success: false, error: 'Admin or owner access required' }, 403);
        }

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const subscriptionService = new SubscriptionService(repository);

        const result = await subscriptionService.downgradeTier(tenantId, body.tier);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data });
    }
);

export default handlersRouter;
