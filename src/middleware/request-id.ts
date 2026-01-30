import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { generateId } from '../services/shared';

/**
 * Request ID Middleware
 * Generates or extracts a unique request ID for tracking requests through the system
 */
export const requestIdMiddleware = createMiddleware<AppEnv>(async (c, next) => {
    // Try to get request ID from header, or generate a new one
    const requestId = c.req.header('X-Request-ID') || generateId('req');
    
    // Store in context for use in handlers and logging
    c.set('requestId', requestId);
    
    // Add to response headers for client tracking
    c.header('X-Request-ID', requestId);
    
    await next();
});
