import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';

/**
 * Security Headers Middleware
 * Adds security-related HTTP headers to all responses
 */
export const securityHeadersMiddleware = createMiddleware<AppEnv>(async (c, next) => {
    await next();
    
    // Prevent clickjacking attacks
    c.header('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS protection (legacy browsers)
    c.header('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy - don't leak referrer to external sites
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions policy - restrict browser features
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Content Security Policy - prevent XSS and injection attacks
    // Adjust based on your needs
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    
    // HSTS - Force HTTPS (only in production)
    const env = c.env.ENVIRONMENT || 'production';
    if (env === 'production') {
        // max-age=31536000 (1 year), includeSubDomains, preload
        c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
});
