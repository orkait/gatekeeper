import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { JWTService } from '../../services/jwt';

export interface SubscriptionAuthInfo {
    userId: string;
    tenantId?: string;
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
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

    c.set('auth', {
        userId: result.payload.sub,
        tenantId: result.payload.tenant_id as string | undefined,
    });

    await next();
}

export async function requireTenantMember(c: Context<AppEnv>, next: Next) {
    const env = getEnv(c.env);
    const auth = c.get('auth') as SubscriptionAuthInfo;
    const tenantId = c.req.param('tenantId');

    if (!tenantId) {
        return c.json({ success: false, error: 'Tenant ID is required' }, 400);
    }

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantUser = await repository.getTenantUser(tenantId, auth.userId);

    if (!tenantUser) {
        return c.json({ success: false, error: 'Access denied' }, 403);
    }

    c.set('tenantRole', tenantUser.role);
    await next();
}

export async function requireInternalAuth(c: Context<AppEnv>, next: Next) {
    const env = getEnv(c.env);
    const internalSecret = c.req.header('X-Internal-Secret');

    if (!internalSecret || internalSecret !== env.internalSecret) {
        return c.json({ success: false, error: 'Invalid internal secret' }, 401);
    }

    await next();
}
