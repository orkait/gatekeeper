import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { ApiKeyService } from '../../services/apikey';
import { requireTenantAdmin } from './middleware';
import { CreateApiKeySchema, UpdateApiKeySchema } from './schemas';

const handlersRouter = new Hono<AppEnv>();

handlersRouter.post(
    '/',
    requireTenantAdmin,
    zValidator('json', CreateApiKeySchema),
    async (c) => {
        const env = getEnv(c.env);
        const input = c.req.valid('json');
        const userId = c.get('userId') as string;
        const tenantId = c.get('tenantId') as string;

        const authDB = createAuthDB(env.db);
        const repository = new AuthRepository(authDB);
        const apiKeyService = new ApiKeyService(repository);

        const result = await apiKeyService.createApiKey({
            tenantId,
            createdBy: userId,
            name: input.name,
            scopes: input.scopes,
            quotaLimit: input.quotaLimit,
            quotaPeriod: input.quotaPeriod,
            expiresInSeconds: input.expiresInSeconds,
        });

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({
            success: true,
            data: result.data,
            message: 'Save this key securely. It cannot be retrieved again.',
        }, 201);
    }
);

handlersRouter.get('/', requireTenantAdmin, async (c) => {
    const env = getEnv(c.env);
    const tenantId = c.get('tenantId') as string;

    const authDB = createAuthDB(env.db);
    const repository = new AuthRepository(authDB);
    const apiKeyService = new ApiKeyService(repository);

    const result = await apiKeyService.listApiKeys(tenantId);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({
        success: true,
        data: result.data,
    });
});

handlersRouter.get('/:id', requireTenantAdmin, async (c) => {
    const env = getEnv(c.env);
    const id = c.req.param('id');
    const tenantId = c.get('tenantId') as string;

    const authDB = createAuthDB(env.db);
    const repository = new AuthRepository(authDB);
    const apiKeyService = new ApiKeyService(repository);

    const result = await apiKeyService.getApiKey(id);

    if (!result.success || !result.data) {
        return c.json({ success: false, error: result.error || 'API key not found' }, 404);
    }

    if (result.data.tenantId !== tenantId) {
        return c.json({ success: false, error: 'API key not found' }, 404);
    }

    return c.json({
        success: true,
        data: result.data,
    });
});

handlersRouter.patch(
    '/:id',
    requireTenantAdmin,
    zValidator('json', UpdateApiKeySchema),
    async (c) => {
        const env = getEnv(c.env);
        const id = c.req.param('id');
        const input = c.req.valid('json');
        const tenantId = c.get('tenantId') as string;

        const authDB = createAuthDB(env.db);
        const repository = new AuthRepository(authDB);
        const apiKeyService = new ApiKeyService(repository);

        const existing = await apiKeyService.getApiKey(id);
        if (!existing.success || !existing.data || existing.data.tenantId !== tenantId) {
            return c.json({ success: false, error: 'API key not found' }, 404);
        }

        const result = await apiKeyService.updateApiKey(id, input);

        if (!result.success) {
            return c.json({ success: false, error: result.error }, 400);
        }

        return c.json({
            success: true,
            data: result.data,
        });
    }
);

handlersRouter.delete('/:id', requireTenantAdmin, async (c) => {
    const env = getEnv(c.env);
    const id = c.req.param('id');
    const tenantId = c.get('tenantId') as string;

    const authDB = createAuthDB(env.db);
    const repository = new AuthRepository(authDB);
    const apiKeyService = new ApiKeyService(repository);

    const existing = await apiKeyService.getApiKey(id);
    if (!existing.success || !existing.data || existing.data.tenantId !== tenantId) {
        return c.json({ success: false, error: 'API key not found' }, 404);
    }

    const result = await apiKeyService.revokeApiKey(id);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({
        success: true,
        message: 'API key revoked',
    });
});

export default handlersRouter;
