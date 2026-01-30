import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { authMiddleware, getAuth } from './core';
import { HTTPException } from 'hono/http-exception';

export interface SubscriptionAuthInfo {
    userId: string;
    email: string;
    tenantId: string;
    tenantRole: string;
}


export async function requireTenantMember(c: Context<AppEnv>, next: Next) {
    await authMiddleware(c, async () => {
        const auth = getAuth(c);
        const tenantId = c.req.param('tenantId');

        if (!tenantId) {
            throw new HTTPException(400, { message: 'Tenant ID is required' });
        }

        const env = getEnv(c.env);
        const cacheKey = `tenant-role:${tenantId}:${auth.userId}`;
        const cached = await env.authCache?.get(cacheKey);
        if (cached) {
            // Role is cached, proceed
            await next();
            return;
        }

        const repository = c.get('authRepository');
        const tenantUser = await repository.getTenantUser(tenantId, auth.userId);

        if (!tenantUser) {
            throw new HTTPException(403, { message: 'Tenant membership required' });
        }

        await env.authCache?.put(cacheKey, tenantUser.role, { expirationTtl: 300 });
        await next();
    });
}

export async function requireTenantAdmin(c: Context<AppEnv>, next: Next) {
    await authMiddleware(c, async () => {
        const auth = getAuth(c);
        const tenantId = c.req.param('tenantId');

        if (!tenantId) {
            throw new HTTPException(400, { message: 'Tenant ID is required' });
        }

        const env = getEnv(c.env);
        const cacheKey = `tenant-role:${tenantId}:${auth.userId}`;
        const cached = await env.authCache?.get(cacheKey);
        if (cached) {
            const role = cached;
            if (role !== 'admin' && role !== 'owner') {
                throw new HTTPException(403, { message: 'Admin or owner role required' });
            }
            await next();
            return;
        }

        const repository = c.get('authRepository');
        const tenantUser = await repository.getTenantUser(tenantId, auth.userId);

        if (!tenantUser) {
            throw new HTTPException(403, { message: 'Tenant membership required' });
        }

        if (tenantUser.role !== 'admin' && tenantUser.role !== 'owner') {
            throw new HTTPException(403, { message: 'Admin or owner role required' });
        }

        await env.authCache?.put(cacheKey, tenantUser.role, { expirationTtl: 300 });
        await next();
    });
}

export async function requireInternalAuth(c: Context<AppEnv>, next: Next) {
    const env = getEnv(c.env);
    const internalSecret = c.req.header('X-Internal-Secret');

    if (!internalSecret || internalSecret !== env.internalSecret) {
        throw new HTTPException(401, { message: 'Invalid internal secret' });
    }

    await next();
}
