import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';

export function extractBearerToken(context: Context): string {
    const header = context.req.header('Authorization') || '';
    if (!header.startsWith('Bearer ')) {
        throw new HTTPException(401, { message: 'Authorization header required' });
    }
    return header.slice(7);
}
