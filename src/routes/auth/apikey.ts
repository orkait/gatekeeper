import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { ApiKeyService } from '../../services/apikey';
import { JWTService } from '../../services/jwt';
import { ValidateApiKeySchema } from './schemas';

const apikeyRouter = new Hono<AppEnv>();

apikeyRouter.post(
    '/',
    zValidator('json', ValidateApiKeySchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const env = getEnv(c.env);
        const { apiKey, service } = c.req.valid('json');

        const repository = c.get('authRepository');
        const apiKeyService = new ApiKeyService(repository);
        const jwtService = new JWTService(env.jwtSecret, env.jwtExpiresIn);

        const result = await apiKeyService.validateApiKey(apiKey);

        if (!result.success || !result.data) {
            throw new HTTPException(401, { message: result.error || 'Invalid API key' });
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
