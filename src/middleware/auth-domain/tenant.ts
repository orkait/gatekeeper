import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { getEnv } from '../../env';
import { authMiddleware, getAuth } from './core';
import { HTTPException } from 'hono/http-exception';

export interface TenantAuthInfo {
    userId: string;
    email: string;
    tenantId: string;
    tenantRole: string;
}


export async function requireTenantMember(c: Context<AppEnv>, next: Next) {
    await authMiddleware(c, async () => {
        const auth = getAuth(c);
        const tenantId = c.req.param('id');

        if (!tenantId) {
            throw new HTTPException(400, { message: 'Tenant ID required' });
        }

        const env = getEnv(c.env);
        const cacheKey = `tenant-role:${tenantId}:${auth.userId}`;
        const cached = await env.authCache?.get(cacheKey);
        if (cached) {
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
        const tenantId = c.req.param('id');

        if (!tenantId) {
            throw new HTTPException(400, { message: 'Tenant ID required' });
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

        if (!tenantUser || (tenantUser.role !== 'admin' && tenantUser.role !== 'owner')) {
            throw new HTTPException(403, { message: 'Admin or owner role required' });
        }

        await env.authCache?.put(cacheKey, tenantUser.role, { expirationTtl: 300 });
        await next();
    });
}

export async function requireTenantOwner(c: Context<AppEnv>, next: Next) {
    await authMiddleware(c, async () => {
        const auth = getAuth(c);
        const tenantId = c.req.param('id');

        if (!tenantId) {
            throw new HTTPException(400, { message: 'Tenant ID required' });
        }

        const env = getEnv(c.env);
        const cacheKey = `tenant-role:${tenantId}:${auth.userId}`;
        const cached = await env.authCache?.get(cacheKey);
        if (cached) {
            if (cached !== 'owner') {
                throw new HTTPException(403, { message: 'Owner role required' });
            }
            c.set('tenantRole', cached);
            await next();
            return;
        }

        const repository = c.get('authRepository');
        const tenantUser = await repository.getTenantUser(tenantId, auth.userId);

        if (!tenantUser || tenantUser.role !== 'owner') {
            throw new HTTPException(403, { message: 'Owner role required' });
        }

        await env.authCache?.put(cacheKey, tenantUser.role, { expirationTtl: 300 });
        await next();
    });
}
