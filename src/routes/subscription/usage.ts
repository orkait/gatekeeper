import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { QuotaService } from '../../services/quota';
import { requireTenantMember, requireInternalAuth } from '../../middleware/auth-domain/subscription';
import { RecordUsageSchema } from './schemas';

const usageRouter = new Hono<AppEnv>();

usageRouter.get('/:tenantId', requireTenantMember, async (c) => {
    const tenantId = c.req.param('tenantId');
    const period = c.req.query('period');

    const repository = c.get('authRepository');
    const quotaService = new QuotaService(repository);

    const result = await quotaService.getUsage(tenantId, period);

    if (!result.success) {
        throw new HTTPException(500, { message: result.error || 'Failed to load usage' });
    }

    return c.json({ success: true, data: result.data });
});

usageRouter.get('/:tenantId/events', requireTenantMember, async (c) => {
    const tenantId = c.req.param('tenantId');
    const period = c.req.query('period');
    const service = c.req.query('service');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const repository = c.get('authRepository');
    const quotaService = new QuotaService(repository);

    const result = await quotaService.getUsageEvents(tenantId, {
        period: period || undefined,
        service: service || undefined,
        limit,
        offset,
    });

    if (!result.success) {
        throw new HTTPException(500, { message: result.error || 'Failed to load usage events' });
    }

    return c.json({ success: true, data: result.data });
});

usageRouter.post(
    '/record',
    requireInternalAuth,
    zValidator('json', RecordUsageSchema, (result, _c) => {
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
            throw new HTTPException(400, { message: result.error || 'Usage record failed' });
        }

        if (!result.data?.allowed) {
            throw new HTTPException(429, {
                message: 'Quota exceeded',
                cause: result.data,
            });
        }

        return c.json({ success: true, data: result.data });
    }
);

usageRouter.get('/:tenantId/quota', requireTenantMember, async (c) => {
    const tenantId = c.req.param('tenantId');
    const apiKeyId = c.req.query('apiKeyId');

    const repository = c.get('authRepository');
    const quotaService = new QuotaService(repository);

    const result = await quotaService.checkQuota(tenantId, 0, apiKeyId || undefined);

    if (!result.success) {
        throw new HTTPException(500, { message: result.error || 'Failed to load quota' });
    }

    return c.json({ success: true, data: result.data });
});

export default usageRouter;
