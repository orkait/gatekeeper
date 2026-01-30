import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { WebhookService, WebhookEventType } from '../../services/webhook';
import { requireAuth } from '../../middleware/auth-domain/webhook';
import { getAuth } from '../../middleware/auth-domain/core';
import { RegisterWebhookSchema, UpdateWebhookSchema } from './schemas';

const handlersRouter = new Hono<AppEnv>();

handlersRouter.get('/events', (c) => {
    return c.json({
        success: true,
        data: Object.values(WebhookEventType),
    });
});

handlersRouter.post(
    '/',
    requireAuth,
    zValidator('json', RegisterWebhookSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const auth = getAuth(c);
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const webhookService = new WebhookService(repository);

        const result = await webhookService.registerWebhook({
            tenantId: auth.tenantId || auth.userId,
            url: body.url,
            events: body.events,
            secret: body.secret,
        });

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Webhook create failed' });
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

handlersRouter.get('/', requireAuth, async (c) => {
    const auth = getAuth(c);

    const repository = c.get('authRepository');
    const webhookService = new WebhookService(repository);

    const result = await webhookService.listWebhooks(auth.tenantId || auth.userId);

    if (!result.success) {
        throw new HTTPException(500, { message: result.error || 'Failed to load webhooks' });
    }

    const webhooks = result.data?.map(wh => ({
        ...wh,
        secret: wh.secret ? '***' : null,
    }));

    return c.json({ success: true, data: webhooks });
});

handlersRouter.get('/:id', requireAuth, async (c) => {
    const auth = getAuth(c);
    const webhookId = c.req.param('id');

    const repository = c.get('authRepository');
    const webhookService = new WebhookService(repository);

    const result = await webhookService.getWebhook(webhookId);

    if (!result.success || !result.data) {
        throw new HTTPException(404, { message: 'Webhook not found' });
    }

    if (result.data.tenantId !== auth.tenantId) {
        throw new HTTPException(404, { message: 'Webhook not found' });
    }

    const webhook = {
        ...result.data,
        secret: result.data.secret ? '***' : null,
    };

    return c.json({ success: true, data: webhook });
});

handlersRouter.patch(
    '/:id',
    requireAuth,
    zValidator('json', UpdateWebhookSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const auth = getAuth(c);
        const webhookId = c.req.param('id');
        const body = c.req.valid('json');

        const repository = c.get('authRepository');
        const webhookService = new WebhookService(repository);

        const existing = await webhookService.getWebhook(webhookId);
        if (!existing.success || !existing.data) {
            throw new HTTPException(404, { message: 'Webhook not found' });
        }

        if (existing.data.tenantId !== auth.tenantId) {
            throw new HTTPException(404, { message: 'Webhook not found' });
        }

        const result = await webhookService.updateWebhook(webhookId, body);

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'Webhook update failed' });
        }

        const webhook = {
            ...result.data,
            secret: result.data?.secret ? '***' : null,
        };

        return c.json({ success: true, data: webhook });
    }
);

handlersRouter.delete('/:id', requireAuth, async (c) => {
    const auth = getAuth(c);
    const webhookId = c.req.param('id');

    const repository = c.get('authRepository');
    const webhookService = new WebhookService(repository);

    const existing = await webhookService.getWebhook(webhookId);
    if (!existing.success || !existing.data) {
        throw new HTTPException(404, { message: 'Webhook not found' });
    }

    if (existing.data.tenantId !== auth.tenantId) {
        throw new HTTPException(404, { message: 'Webhook not found' });
    }

    const result = await webhookService.deleteWebhook(webhookId);

    if (!result.success) {
        throw new HTTPException(500, { message: result.error || 'Webhook delete failed' });
    }

    return c.json({ success: true, message: 'Webhook deleted' });
});

export default handlersRouter;
