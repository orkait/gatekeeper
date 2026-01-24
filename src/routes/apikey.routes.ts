import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { getEnv } from '../env';
import { AuthRepository } from '../repositories/auth.repository';
import { createAuthDB } from '../utils/db';
import { ApiKeyService } from '../services/apikey.service';
import { JWTService } from '../services/jwt.service';

const apikeyRoutes = new Hono<AppEnv>();

// ============================================================================
// Schemas
// ============================================================================

const ValidateApiKeySchema = z.object({
    apiKey: z.string().min(1),
    service: z.string().min(1).optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/auth/apikey
 *
 * Validates an API key and returns a JWT if valid.
 * The JWT includes the api_key_id and scopes for authorization.
 */
apikeyRoutes.post(
    '/',
    zValidator('json', ValidateApiKeySchema),
    async (c) => {
        const env = getEnv(c.env);
        const { apiKey, service } = c.req.valid('json');

        // Create services
        const authDB = createAuthDB(env.db);
        const repository = new AuthRepository(authDB);
        const apiKeyService = new ApiKeyService(repository);
        const jwtService = new JWTService(env.jwtSecret, env.jwtExpiresIn);

        // Validate the API key
        const result = await apiKeyService.validateApiKey(apiKey);

        if (!result.success || !result.data) {
            return c.json({
                success: false,
                error: result.error || 'Invalid API key',
            }, 401);
        }

        const key = result.data;

        // Generate JWT with API key claims
        const audience = service || 'default';
        const accessToken = await jwtService.signApiKeyJWT({
            tenantId: key.tenantId,
            apiKeyId: key.id,
            scopes: key.scopes,
            audience,
            expiresInSeconds: env.jwtExpiresIn,
        });

        return c.json({
            success: true,
            data: {
                accessToken,
                tokenType: 'Bearer',
                expiresIn: env.jwtExpiresIn,
                tenantId: key.tenantId,
                apiKeyId: key.id,
                scopes: key.scopes,
            },
        });
    }
);

export default apikeyRoutes;
