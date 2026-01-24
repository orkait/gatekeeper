import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../env';
import { getEnv } from '../env';
import { AuthRepository, type TenantRole } from '../repositories/auth.repository';
import { createAuthDB } from '../utils/db';
import { createAuthCache } from '../utils/cache';
import { AuthorizationService, type AuthorizeContext } from '../services/authorization.service';
import { JWTService } from '../services/jwt.service';

/**
 * Zod schema for authorize request.
 */
const AuthorizeRequestSchema = z.object({
    /** Action being performed (e.g., 'read', 'write', 'delete') */
    action: z.string().min(1),
    /** Resource being accessed (optional) */
    resource: z.string().optional(),
    /** Additional context for authorization */
    context: z.object({
        /** Tenant ID (required) */
        tenantId: z.string().min(1),
        /** Service being accessed (required) */
        service: z.string().min(1),
        /** Session ID (optional, for session-based auth) */
        sessionId: z.string().optional(),
        /** API Key ID (optional, for API key auth) */
        apiKeyId: z.string().optional(),
        /** Required feature flag name (optional) */
        requiredFeature: z.string().optional(),
        /** Required role (optional) */
        requiredRole: z.enum(['member', 'admin', 'owner']).optional(),
        /** Quantity for quota check (default: 1) */
        quantity: z.number().int().positive().optional(),
    }),
});

type AuthorizeRequest = z.infer<typeof AuthorizeRequestSchema>;

/**
 * JWT payload from auth middleware.
 */
interface JWTAuth {
    userId: string;
    email?: string;
    tenantId?: string;
    sessionId?: string;
    apiKeyId?: string;
    scope?: string[];
}

/**
 * Create authorize routes.
 */
const authorizeRoutes = new Hono<AppEnv>();

/**
 * POST /api/authorize
 * 
 * Central authorization endpoint for services to call.
 * Requires a valid JWT (session or API key JWT).
 * 
 * Request body:
 * {
 *   "action": "read",
 *   "resource": "documents/123",
 *   "context": {
 *     "tenantId": "tenant_xxx",
 *     "service": "documents",
 *     "requiredFeature": "advanced_export",
 *     "requiredRole": "admin",
 *     "quantity": 1
 *   }
 * }
 * 
 * Response:
 * {
 *   "allowed": true,
 *   "reason": "Authorized",
 *   "metadata": { ... }
 * }
 */
authorizeRoutes.post(
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

        // Get JWT auth from header
        const authHeader = c.req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new HTTPException(401, { message: 'Authorization header required' });
        }

        const token = authHeader.slice(7);
        
        // Initialize services
        const db = createAuthDB(env.db);
        const repository = new AuthRepository(db);
        const authCache = env.authCache ? createAuthCache(env.authCache) : undefined;
        const jwtService = new JWTService(env.jwtSecret);
        
        // Verify JWT and extract payload
        const jwtAuth = await verifyAndExtractJWT(token, jwtService);
        if (!jwtAuth) {
            throw new HTTPException(401, { message: 'Invalid or expired token' });
        }

        const body = c.req.valid('json') as AuthorizeRequest;

        // Build authorization context
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

        // Perform authorization
        const authService = new AuthorizationService(repository, authCache);
        const result = await authService.authorize(authCtx);

        if (!result.success) {
            throw new HTTPException(500, { message: result.error || 'Authorization failed' });
        }

        // Return authorization result
        return c.json(result.data, result.data?.allowed ? 200 : 403);
    }
);

/**
 * Verify JWT and extract auth info.
 * Supports both session JWTs and API key JWTs.
 */
async function verifyAndExtractJWT(token: string, jwtService: JWTService): Promise<JWTAuth | null> {
    try {
        // Verify JWT using the service
        const result = await jwtService.verifyJWT(token);
        
        if (!result.valid || !result.payload) {
            return null;
        }

        const payload = result.payload;

        // Ensure we have a subject
        if (!payload.sub) {
            return null;
        }

        // Extract auth info based on JWT type (check for api_key_id property)
        if ('api_key_id' in payload && payload.api_key_id) {
            // API Key JWT
            return {
                userId: payload.sub, // For API key, sub is tenant_id
                tenantId: payload.sub,
                apiKeyId: payload.api_key_id as string,
                scope: 'scope' in payload ? payload.scope as string[] : undefined,
            };
        } else {
            // Session JWT
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

export default authorizeRoutes;
