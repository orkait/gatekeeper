import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { SubscriptionService } from '../../services/subscription';
import { requireTenantMember, requireTenantAdmin } from '../../middleware/auth-domain/subscription';
import { UpgradeSubscriptionSchema } from './schemas';

const handlersRouter = new Hono<AppEnv>();

handlersRouter.get('/:tenantId', requireTenantMember, async (c) => {
    const tenantId = c.req.param('tenantId');

    const repository = c.get('authRepository');
    const subscriptionService = new SubscriptionService(repository);

    const result = await subscriptionService.getSubscriptionWithItems(tenantId);

    if (!result.success || !result.data) {
        throw new HTTPException(404, { message: result.error || 'Subscription not found' });
    }

    return c.json({ success: true, data: result.data });
});

handlersRouter.post(
    '/:tenantId/upgrade',
    requireTenantAdmin,
    zValidator('json', UpgradeSubscriptionSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const tenantId = c.req.param('tenantId');
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const subscriptionService = new SubscriptionService(repository);

        const result = await subscriptionService.upgradeTier(tenantId, body.tier);

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Upgrade failed' });
        }

        return c.json({ success: true, data: result.data });
    }
);

handlersRouter.post(
    '/:tenantId/downgrade',
    requireTenantAdmin,
    zValidator('json', UpgradeSubscriptionSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const tenantId = c.req.param('tenantId');
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const subscriptionService = new SubscriptionService(repository);

        const result = await subscriptionService.downgradeTier(tenantId, body.tier);

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Downgrade failed' });
        }

        return c.json({ success: true, data: result.data });
    }
);

export default handlersRouter;
