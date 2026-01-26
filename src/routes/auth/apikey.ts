import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { ApiKeyService } from '../../services/apikey';
import { JWTService } from '../../services/jwt';
import { ValidateApiKeySchema } from './schemas';

const apikeyRouter = new Hono<AppEnv>();

apikeyRouter.post(
    '/',
    zValidator('json', ValidateApiKeySchema),
    async (c) => {
        const env = getEnv(c.env);
        const { apiKey, service } = c.req.valid('json');

        const authDB = createAuthDB(env.db);
        const repository = new AuthRepository(authDB);
        const apiKeyService = new ApiKeyService(repository);
        const jwtService = new JWTService(env.jwtSecret, env.jwtExpiresIn);

        const result = await apiKeyService.validateApiKey(apiKey);

        if (!result.success || !result.data) {
            return c.json({
                success: false,
                error: result.error || 'Invalid API key',
            }, 401);
        }

        const key = result.data;

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

export default apikeyRouter;
