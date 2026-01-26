import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { WebhookService, WebhookEventType } from '../../services/webhook';
import { requireAuth, type WebhookAuthInfo } from './middleware';
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
    zValidator('json', RegisterWebhookSchema, (result, c) => {
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
        const auth = c.get('auth') as WebhookAuthInfo;
        const body = c.req.valid('json');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const webhookService = new WebhookService(repository);

        const result = await webhookService.registerWebhook({
            tenantId: auth.tenantId,
            url: body.url,
            events: body.events,
            secret: body.secret,
        });

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({ success: true, data: result.data }, 201);
    }
);

handlersRouter.get('/', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as WebhookAuthInfo;

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const webhookService = new WebhookService(repository);

    const result = await webhookService.listWebhooks(auth.tenantId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    const webhooks = result.data?.map(wh => ({
        ...wh,
        secret: wh.secret ? '***' : null,
    }));

    return c.json({ success: true, data: webhooks });
});

handlersRouter.get('/:id', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as WebhookAuthInfo;
    const webhookId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const webhookService = new WebhookService(repository);

    const result = await webhookService.getWebhook(webhookId);

    if (!result.success || !result.data) {
        return c.json({ success: false, error: 'Webhook not found' }, 404);
    }

    if (result.data.tenantId !== auth.tenantId) {
        return c.json({ success: false, error: 'Webhook not found' }, 404);
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
    zValidator('json', UpdateWebhookSchema, (result, c) => {
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
        const auth = c.get('auth') as WebhookAuthInfo;
        const webhookId = c.req.param('id');
        const body = c.req.valid('json');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const webhookService = new WebhookService(repository);

        const existing = await webhookService.getWebhook(webhookId);
        if (!existing.success || !existing.data) {
            return c.json({ success: false, error: 'Webhook not found' }, 404);
        }

        if (existing.data.tenantId !== auth.tenantId) {
            return c.json({ success: false, error: 'Webhook not found' }, 404);
        }

        const result = await webhookService.updateWebhook(webhookId, body);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        const webhook = {
            ...result.data,
            secret: result.data?.secret ? '***' : null,
        };

        return c.json({ success: true, data: webhook });
    }
);

handlersRouter.delete('/:id', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as WebhookAuthInfo;
    const webhookId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const webhookService = new WebhookService(repository);

    const existing = await webhookService.getWebhook(webhookId);
    if (!existing.success || !existing.data) {
        return c.json({ success: false, error: 'Webhook not found' }, 404);
    }

    if (existing.data.tenantId !== auth.tenantId) {
        return c.json({ success: false, error: 'Webhook not found' }, 404);
    }

    const result = await webhookService.deleteWebhook(webhookId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({ success: true, message: 'Webhook deleted' });
});

export default handlersRouter;
