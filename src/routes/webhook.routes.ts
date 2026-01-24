import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../env';
import { getEnv } from '../env';
import { AuthRepository } from '../repositories/auth.repository';
import { createAuthDB } from '../utils/db';
import { WebhookService, WebhookEventType } from '../services/webhook.service';
import { JWTService } from '../services/jwt.service';

const webhookRoutes = new Hono<AppEnv>();

// ============================================================================
// Schemas
// ============================================================================

const RegisterWebhookSchema = z.object({
    url: z.string().url('Invalid URL format'),
    events: z.array(z.string()).min(1, 'At least one event type is required'),
    secret: z.string().optional(),
});

const UpdateWebhookSchema = z.object({
    url: z.string().url('Invalid URL format').optional(),
    events: z.array(z.string()).min(1).optional(),
    secret: z.string().optional(),
    active: z.boolean().optional(),
});

// ============================================================================
// Middleware
// ============================================================================

/**
 * Verify JWT and extract tenant ID.
 */
async function requireAuth(c: any, next: any) {
    const env = getEnv(c.env);
    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ success: false, error: 'Missing authorization token' }, 401);
    }

    const token = authHeader.slice(7);
    const jwtService = new JWTService(env.jwtSecret);
    const result = await jwtService.verifyJWT(token);

    if (!result.valid || !result.payload) {
        return c.json({ success: false, error: result.error || 'Invalid token' }, 401);
    }

    // Extract tenant ID from payload
    const tenantId = result.payload.tenant_id || result.payload.sub;
    if (!tenantId) {
        return c.json({ success: false, error: 'Missing tenant context' }, 400);
    }

    c.set('auth', {
        userId: result.payload.sub,
        tenantId: tenantId,
    });

    await next();
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/webhooks/events
 * List all valid webhook event types.
 */
webhookRoutes.get('/events', (c) => {
    return c.json({
        success: true,
        data: Object.values(WebhookEventType),
    });
});

/**
 * POST /api/webhooks
 * Register a new webhook endpoint.
 */
webhookRoutes.post(
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
        const auth = c.get('auth') as { userId: string; tenantId: string };
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

/**
 * GET /api/webhooks
 * List all webhooks for the tenant.
 */
webhookRoutes.get('/', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as { userId: string; tenantId: string };

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const webhookService = new WebhookService(repository);

    const result = await webhookService.listWebhooks(auth.tenantId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 500);
    }

    // Don't expose secrets in list response
    const webhooks = result.data?.map(wh => ({
        ...wh,
        secret: wh.secret ? '***' : null,
    }));

    return c.json({ success: true, data: webhooks });
});

/**
 * GET /api/webhooks/:id
 * Get a specific webhook.
 */
webhookRoutes.get('/:id', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as { userId: string; tenantId: string };
    const webhookId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const webhookService = new WebhookService(repository);

    const result = await webhookService.getWebhook(webhookId);

    if (!result.success || !result.data) {
        return c.json({ success: false, error: 'Webhook not found' }, 404);
    }

    // Verify tenant ownership
    if (result.data.tenantId !== auth.tenantId) {
        return c.json({ success: false, error: 'Webhook not found' }, 404);
    }

    // Don't expose secret
    const webhook = {
        ...result.data,
        secret: result.data.secret ? '***' : null,
    };

    return c.json({ success: true, data: webhook });
});

/**
 * PATCH /api/webhooks/:id
 * Update a webhook.
 */
webhookRoutes.patch(
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
        const auth = c.get('auth') as { userId: string; tenantId: string };
        const webhookId = c.req.param('id');
        const body = c.req.valid('json');

        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const webhookService = new WebhookService(repository);

        // Verify ownership first
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

        // Don't expose secret
        const webhook = {
            ...result.data,
            secret: result.data?.secret ? '***' : null,
        };

        return c.json({ success: true, data: webhook });
    }
);

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook.
 */
webhookRoutes.delete('/:id', requireAuth, async (c) => {
    const env = getEnv(c.env);
    const auth = c.get('auth') as { userId: string; tenantId: string };
    const webhookId = c.req.param('id');

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const webhookService = new WebhookService(repository);

    // Verify ownership first
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

export default webhookRoutes;
