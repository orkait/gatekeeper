import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { QuotaService } from '../../services/quota';
import { requireAuth, requireTenantMember, requireInternalAuth } from './middleware';
import { RecordUsageSchema } from './schemas';

const usageRouter = new Hono<AppEnv>();

usageRouter.get('/:tenantId', requireAuth, requireTenantMember, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.param('tenantId');
    const period = c.req.query('period');

    if (!tenantId) {
        return c.json({ success: false, error: 'Tenant ID is required' }, 400);
    }

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const quotaService = new QuotaService(repository);

    const result = await quotaService.getUsage(tenantId, period);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

usageRouter.get('/:tenantId/events', requireAuth, requireTenantMember, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.param('tenantId');
    const period = c.req.query('period');
    const service = c.req.query('service');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    if (!tenantId) {
        return c.json({ success: false, error: 'Tenant ID is required' }, 400);
    }

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const quotaService = new QuotaService(repository);

    const result = await quotaService.getUsageEvents(tenantId, {
        period: period || undefined,
        service: service || undefined,
        limit,
        offset,
    });

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

usageRouter.post(
    '/record',
    requireInternalAuth,
    zValidator('json', RecordUsageSchema, (result, c) => {
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
        const quotaService = new QuotaService(repository);

        const result = await quotaService.checkAndRecordUsage({
            tenantId: body.tenantId,
            apiKeyId: body.apiKeyId,
            userId: body.userId,
            service: body.service,
            action: body.action,
            quantity: body.quantity,
            idempotencyKey: body.idempotencyKey,
        });

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        if (!result.data?.allowed) {
            return c.json({
                success: false,
                error: 'Quota exceeded',
                quota: result.data,
            }, 429);
        }

        return c.json({ success: true, data: result.data });
    }
);

usageRouter.get('/:tenantId/quota', requireAuth, requireTenantMember, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.req.param('tenantId');
    const apiKeyId = c.req.query('apiKeyId');

    if (!tenantId) {
        return c.json({ success: false, error: 'Tenant ID is required' }, 400);
    }

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const quotaService = new QuotaService(repository);

    const result = await quotaService.checkQuota(tenantId, 0, apiKeyId || undefined);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, data: result.data });
});

export default usageRouter;
