import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import type { TenantRole } from '../../repositories';
import { createAuthCache } from '../../utils/cache';
import { AuthorizationService, type AuthorizeContext } from '../../services/authorization';
import { AuthorizeRequestSchema, type AuthorizeRequest } from './schemas';
import { authMiddleware, getAuth } from '../../middleware/auth-domain/core';


const handlersRouter = new Hono<AppEnv>();

handlersRouter.post(
    '/',
    authMiddleware,
    zValidator('json', AuthorizeRequestSchema, (result, _c) => {
        if (!result.success) {
            throw new HTTPException(400, {
                message: 'Validation failed',
                cause: result.error.flatten(),
            });
        }
    }),
    async (c) => {
        const env = getEnv(c.env);
        const auth = getAuth(c);

        const repository = c.get('authRepository');
        const authCache = env.authCache ? createAuthCache(env.authCache) : undefined;

        const body = c.req.valid('json') as AuthorizeRequest;

        const authCtx: AuthorizeContext = {
            userId: auth.userId,
            tenantId: body.context.tenantId,
            sessionId: body.context.sessionId,
            apiKeyId: body.context.apiKeyId,
            service: body.context.service,
            action: body.action,
            resource: body.resource,
            requiredFeature: body.context.requiredFeature,
            requiredRole: body.context.requiredRole as TenantRole | undefined,
            quantity: body.context.quantity,
        };

        const authService = new AuthorizationService(repository, authCache);
        const result = await authService.authorize(authCtx);

        if (!result.success) {
            throw new HTTPException(403, { message: result.error || 'Forbidden' });
        }

        return c.json(result.data, result.data?.allowed ? 200 : 403);
    }
);

export default handlersRouter;
