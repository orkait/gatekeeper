import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { authMiddleware, getAuth } from './core';
import { HTTPException } from 'hono/http-exception';

export interface AdminAuthInfo {
    userId: string;
    tenantId?: string;
    isAdmin: boolean;
    email: string;
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
    const env = getEnv(c.env);

    const internalSecret = c.req.header('X-Internal-Secret');
    if (internalSecret === env.internalSecret) {
        c.set('auth', { userId: 'system', isAdmin: true, email: 'system@orkait.com' } as AdminAuthInfo);
        await next();
        return;
    }

    await authMiddleware(c, async () => {
        const auth = getAuth(c);
        const repository = c.get('authRepository');
        const tenants = await repository.getUserTenants(auth.userId);
        const isOwner = tenants.some(t => t.role === 'owner');

        if (!isOwner) {
            throw new HTTPException(403, { message: 'Admin or owner role required' });
        }

        const adminAuthInfo: AdminAuthInfo = {
            userId: auth.userId,
            tenantId: auth.tenantId,
            isAdmin: isOwner,
            email: auth.email
        };

        c.set('auth', adminAuthInfo);
        await next();
    });
}
