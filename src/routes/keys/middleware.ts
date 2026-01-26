import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { AuthRepository } from '../../repositories';
import { createAuthDB } from '../../utils/db';
import { JWTService } from '../../services/jwt';

export interface KeysAuthInfo {
    userId: string;
    tenantId: string;
    role: string;
}

export async function requireTenantAdmin(c: Context<AppEnv>, next: Next) {
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

    if (result.type !== 'session') {
        return c.json({ success: false, error: 'Session token required' }, 403);
    }

    const payload = result.payload as {
        sub: string;
        tenant_id: string;
        session_id: string;
    };

    const authDB = createAuthDB(env.db);
    const repository = new AuthRepository(authDB);
    const tenantUser = await repository.getTenantUser(payload.tenant_id, payload.sub);

    if (!tenantUser) {
        return c.json({ success: false, error: 'Not a member of this tenant' }, 403);
    }

    if (tenantUser.role !== 'owner' && tenantUser.role !== 'admin') {
        return c.json({ success: false, error: 'Admin or owner role required' }, 403);
    }

    c.set('userId', payload.sub);
    c.set('tenantId', payload.tenant_id);
    c.set('role', tenantUser.role);

    await next();
}
