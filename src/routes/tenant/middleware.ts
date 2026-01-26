import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { JWTService } from '../../services/jwt';

export interface TenantAuthInfo {
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
    } as TenantAuthInfo);

    await next();
}

export async function requireTenantAdmin(c: Context<AppEnv>, next: Next) {
    const env = getEnv(c.env);
    const auth = c.get('auth') as TenantAuthInfo;
    const tenantId = c.req.param('id');

    if (!tenantId) {
        return c.json({ success: false, error: 'Tenant ID required' }, 400);
    }

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenantUser = await repository.getTenantUser(tenantId, auth.userId);

    if (!tenantUser || (tenantUser.role !== 'admin' && tenantUser.role !== 'owner')) {
        return c.json({ success: false, error: 'Admin or owner access required' }, 403);
    }

    c.set('tenantRole', tenantUser.role);
    await next();
}
