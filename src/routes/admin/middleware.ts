import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { JWTService } from '../../services/jwt';

export interface AdminAuthInfo {
    userId: string;
    tenantId?: string;
    isAdmin: boolean;
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
    const env = getEnv(c.env);

    const internalSecret = c.req.header('X-Internal-Secret');
    if (internalSecret === env.internalSecret) {
        c.set('auth', { userId: 'system', isAdmin: true } as AdminAuthInfo);
        await next();
        return;
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ success: false, error: 'Admin authorization required' }, 401);
    }

    const token = authHeader.slice(7);
    const jwtService = new JWTService(env.jwtSecret);
    const result = await jwtService.verifyJWT(token);

    if (!result.valid || !result.payload) {
        return c.json({ success: false, error: result.error || 'Invalid token' }, 401);
    }

    const db = createAuthDB(env.db);
    const repository = new AuthRepository(db);
    const tenants = await repository.getUserTenants(result.payload.sub);
    const isOwner = tenants.some(t => t.role === 'owner');

    if (!isOwner) {
        return c.json({ success: false, error: 'Admin access required' }, 403);
    }

    c.set('auth', {
        userId: result.payload.sub,
        tenantId: result.payload.tenant_id as string | undefined,
        isAdmin: true,
    } as AdminAuthInfo);

    await next();
}
