import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { getEnv } from '../env';
import { AuthRepository } from '../repositories/auth.repository';
import { createAuthDB } from '../utils/db';
import { ApiKeyService } from '../services/apikey.service';
import { JWTService } from '../services/jwt.service';

const keysRoutes = new Hono<AppEnv>();

// ============================================================================
// Schemas
// ============================================================================

const CreateApiKeySchema = z.object({
    name: z.string().min(1).max(255).optional(),
    scopes: z.array(z.string()).optional(),
    quotaLimit: z.number().int().positive().optional(),
    quotaPeriod: z.enum(['hour', 'day', 'month']).optional(),
    expiresInSeconds: z.number().int().positive().optional(),
});

const UpdateApiKeySchema = z.object({
    name: z.string().min(1).max(255).optional(),
    scopes: z.array(z.string()).optional(),
});

// ============================================================================
// Middleware
// ============================================================================

/**
 * Verify JWT and check tenant admin/owner authorization.
 */
async function requireTenantAdmin(c: any, next: any) {
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

    // Check if this is a session token (has tenant_id and session_id)
    if (result.type !== 'session') {
        return c.json({ success: false, error: 'Session token required' }, 403);
    }

    const payload = result.payload as {
        sub: string;
        tenant_id: string;
        session_id: string;
    };

    // Check if user is admin/owner of the tenant
    const authDB = createAuthDB(env.db);
    const repository = new AuthRepository(authDB);
    const tenantUser = await repository.getTenantUser(payload.tenant_id, payload.sub);

    if (!tenantUser) {
        return c.json({ success: false, error: 'Not a member of this tenant' }, 403);
    }

    if (tenantUser.role !== 'owner' && tenantUser.role !== 'admin') {
        return c.json({ success: false, error: 'Admin or owner role required' }, 403);
    }

    // Set context for downstream handlers
    c.set('userId', payload.sub);
    c.set('tenantId', payload.tenant_id);
    c.set('role', tenantUser.role);

    await next();
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/keys
 *
 * Create a new API key. Returns the plaintext key only once.
 * Requires tenant admin/owner authorization.
 */
keysRoutes.post(
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

/**
 * GET /api/keys
 *
 * List all API keys for the tenant (without secrets).
 * Requires tenant admin/owner authorization.
 */
keysRoutes.get('/', requireTenantAdmin, async (c) => {
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

/**
 * GET /api/keys/:id
 *
 * Get a specific API key by ID (without secrets).
 * Requires tenant admin/owner authorization.
 */
keysRoutes.get('/:id', requireTenantAdmin, async (c) => {
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

    // Verify the key belongs to the tenant
    if (result.data.tenantId !== tenantId) {
        return c.json({ success: false, error: 'API key not found' }, 404);
    }

    return c.json({
        success: true,
        data: result.data,
    });
});

/**
 * PATCH /api/keys/:id
 *
 * Update an API key (name or scopes).
 * Requires tenant admin/owner authorization.
 */
keysRoutes.patch(
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

        // Verify the key belongs to the tenant
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

/**
 * DELETE /api/keys/:id
 *
 * Revoke an API key.
 * Requires tenant admin/owner authorization.
 */
keysRoutes.delete('/:id', requireTenantAdmin, async (c) => {
    const env = getEnv(c.env);
    const id = c.req.param('id');
    const tenantId = c.get('tenantId') as string;

    const authDB = createAuthDB(env.db);
    const repository = new AuthRepository(authDB);
    const apiKeyService = new ApiKeyService(repository);

    // Verify the key belongs to the tenant
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

export default keysRoutes;
