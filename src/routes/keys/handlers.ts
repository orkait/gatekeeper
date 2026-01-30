import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { ApiKeyService } from '../../services/apikey';
import { requireTenantAdmin } from '../../middleware/auth-domain/keys';
import { CreateApiKeySchema, UpdateApiKeySchema } from './schemas';

const handlersRouter = new Hono<AppEnv>();

handlersRouter.post(
    '/',
    requireTenantAdmin,
    zValidator('json', CreateApiKeySchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const input = c.req.valid('json');
        const userId = c.get('userId') as string;
        const tenantId = c.get('tenantId') as string;

        const repository = c.get('authRepository');
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
            throw new HTTPException(400, { message: result.error || 'API key create failed' });
        }

        return c.json({
            success: true,
            data: result.data,
            message: 'Save this key securely. It cannot be retrieved again.',
        }, 201);
    }
);

handlersRouter.get('/', requireTenantAdmin, async (c) => {
    const tenantId = c.get('tenantId') as string;

    const repository = c.get('authRepository');
    const apiKeyService = new ApiKeyService(repository);

    const result = await apiKeyService.listApiKeys(tenantId);

    if (!result.success) {
        throw new HTTPException(400, { message: result.error || 'Failed to list API keys' });
    }

    return c.json({
        success: true,
        data: result.data,
    });
});

handlersRouter.get('/:id', requireTenantAdmin, async (c) => {
    const id = c.req.param('id');
    const tenantId = c.get('tenantId') as string;

    const repository = c.get('authRepository');
    const apiKeyService = new ApiKeyService(repository);

    const result = await apiKeyService.getApiKey(id);

    if (!result.success || !result.data) {
        throw new HTTPException(404, { message: result.error || 'API key not found' });
    }

    if (result.data.tenantId !== tenantId) {
        throw new HTTPException(404, { message: 'API key not found' });
    }

    return c.json({
        success: true,
        data: result.data,
    });
});

handlersRouter.patch(
    '/:id',
    requireTenantAdmin,
    zValidator('json', UpdateApiKeySchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const id = c.req.param('id');
        const input = c.req.valid('json');
        const tenantId = c.get('tenantId') as string;

        const repository = c.get('authRepository');
        const apiKeyService = new ApiKeyService(repository);

        const existing = await apiKeyService.getApiKey(id);
        if (!existing.success || !existing.data || existing.data.tenantId !== tenantId) {
            throw new HTTPException(404, { message: 'API key not found' });
        }

        const result = await apiKeyService.updateApiKey(id, input);

        if (!result.success) {
            throw new HTTPException(400, { message: result.error || 'API key update failed' });
        }

        return c.json({
            success: true,
            data: result.data,
        });
    }
);

handlersRouter.delete('/:id', requireTenantAdmin, async (c) => {
    const id = c.req.param('id');
    const tenantId = c.get('tenantId') as string;

    const repository = c.get('authRepository');
    const apiKeyService = new ApiKeyService(repository);

    const existing = await apiKeyService.getApiKey(id);
    if (!existing.success || !existing.data || existing.data.tenantId !== tenantId) {
        throw new HTTPException(404, { message: 'API key not found' });
    }

    const result = await apiKeyService.revokeApiKey(id);

    if (!result.success) {
        throw new HTTPException(400, { message: result.error || 'API key revoke failed' });
    }

    return c.json({
        success: true,
        message: 'API key revoked',
    });
});

export default handlersRouter;
