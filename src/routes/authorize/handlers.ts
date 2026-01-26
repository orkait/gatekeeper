import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository, type TenantRole } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { createAuthCache } from '../../utils/cache';
import { AuthorizationService, type AuthorizeContext } from '../../services/authorization';
import { JWTService } from '../../services/jwt';
import { AuthorizeRequestSchema, type AuthorizeRequest } from './schemas';

interface JWTAuth {
    userId: string;
    email?: string;
    tenantId?: string;
    sessionId?: string;
    apiKeyId?: string;
    scope?: string[];
}

async function verifyAndExtractJWT(token: string, jwtService: JWTService): Promise<JWTAuth | null> {
    try {
        const result = await jwtService.verifyJWT(token);
        
        if (!result.valid || !result.payload) {
            return null;
        }

        const payload = result.payload;

        if (!payload.sub) {
            return null;
        }

        if ('api_key_id' in payload && payload.api_key_id) {
            return {
                userId: payload.sub,
                tenantId: payload.sub,
                apiKeyId: payload.api_key_id as string,
                scope: 'scope' in payload ? payload.scope as string[] : undefined,
            };
        } else {
            return {
                userId: payload.sub,
                email: 'email' in payload ? payload.email as string : undefined,
                tenantId: 'tenant_id' in payload ? payload.tenant_id as string : undefined,
                sessionId: 'session_id' in payload ? payload.session_id as string : undefined,
            };
        }
    } catch {
        return null;
    }
}

const handlersRouter = new Hono<AppEnv>();

handlersRouter.post(
    '/',
    zValidator('json', AuthorizeRequestSchema, (result, c) => {
        if (!result.success) {
            return c.json(
                {
                    error: 'Validation failed',
                    details: result.error.flatten(),
                },
                400
            );
        }
    }),
    async (c) => {
        const env = getEnv(c.env);

        const authHeader = c.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new HTTPException(401, { message: 'Authorization header required' });
        }

        const token = authHeader.slice(7);
        
        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const authCache = env.authCache ? createAuthCache(env.authCache) : undefined;
        const jwtService = new JWTService(env.jwtSecret);
        
        const jwtAuth = await verifyAndExtractJWT(token, jwtService);
        if (!jwtAuth) {
            throw new HTTPException(401, { message: 'Invalid or expired token' });
        }

        const body = c.req.valid('json') as AuthorizeRequest;

        const authCtx: AuthorizeContext = {
            userId: jwtAuth.userId,
            tenantId: body.context.tenantId,
            sessionId: body.context.sessionId || jwtAuth.sessionId,
            service: body.context.service,
            action: body.action,
            resource: body.resource,
            apiKeyId: body.context.apiKeyId || jwtAuth.apiKeyId,
            requiredFeature: body.context.requiredFeature,
            requiredRole: body.context.requiredRole as TenantRole | undefined,
            quantity: body.context.quantity,
        };

        const authService = new AuthorizationService(repository, authCache);
        const result = await authService.authorize(authCtx);

        if (!result.success) {
            throw new HTTPException(500, { message: result.error || 'Authorization failed' });
        }

        return c.json(result.data, result.data?.allowed ? 200 : 403);
    }
);

export default handlersRouter;
