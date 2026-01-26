import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { JWTService } from '../../services/jwt';

export interface WebhookAuthInfo {
    userId: string;
    tenantId: string;
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

    const tenantId = result.payload.tenant_id || result.payload.sub;
    if (!tenantId) {
        return c.json({ success: false, error: 'Missing tenant context' }, 400);
    }

    c.set('auth', {
        userId: result.payload.sub,
        tenantId: tenantId,
    });

    await next();
}
