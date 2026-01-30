import type { Context, Next } from 'hono';
import type { AppEnv } from '../../env';
import { authMiddleware, getAuth } from './core';
import { HTTPException } from 'hono/http-exception';

export interface WebhookAuthInfo {
    userId: string;
    email: string;
    tenantId: string;
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
    await authMiddleware(c, async () => {
        const auth = getAuth(c);
        
        const tenantId = auth.tenantId || auth.userId;
        if (!tenantId) {
            throw new HTTPException(400, { message: 'Missing tenant context' });
        }

        await next();
    });
}
