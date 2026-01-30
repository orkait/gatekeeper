import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { authMiddleware, getAuth } from './core';
import { HTTPException } from 'hono/http-exception';

export interface KeysAuthInfo {
    userId: string;
    tenantId: string;
    role: string;
}

export async function requireTenantAdmin(c: Context<AppEnv>, next: Next) {
    await authMiddleware(c, async () => {
        const auth = getAuth(c);
        
        if (!auth.tenantId) {
            throw new HTTPException(403, { message: 'Tenant context required for admin operations' });
        }

        const env = getEnv(c.env);
        const cacheKey = `tenant-role:${auth.tenantId}:${auth.userId}`;
        const cached = await env.authCache?.get(cacheKey);
        if (cached) {
            const role = cached;
            if (role !== 'owner' && role !== 'admin') {
                throw new HTTPException(403, { message: 'Admin or owner role required' });
            }
            c.set('userId', auth.userId);
            c.set('tenantId', auth.tenantId);
            await next();
            return;
        }

        const repository = c.get('authRepository');
        const tenantUser = await repository.getTenantUser(auth.tenantId, auth.userId);

        if (!tenantUser) {
            throw new HTTPException(403, { message: 'Tenant membership required' });
        }

        if (tenantUser.role !== 'owner' && tenantUser.role !== 'admin') {
            throw new HTTPException(403, { message: 'Admin or owner role required' });
        }

        c.set('userId', auth.userId);
        c.set('tenantId', auth.tenantId);

        await env.authCache?.put(cacheKey, tenantUser.role, { expirationTtl: 300 });
        await next();
    });
}
