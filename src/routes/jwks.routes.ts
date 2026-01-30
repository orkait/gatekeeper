import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { getEnv } from '../env';
import { createJWKSService } from '../services/jwks';
import { JWKS_CACHE_MAX_AGE_SECONDS, JWKS_STALE_WHILE_REVALIDATE_SECONDS } from '../constants/auth';
import { logger } from '../utils/logger';

const jwksRoutes = new Hono<AppEnv>();

/**
 * GET /.well-known/jwks.json
 *
 * Returns the public keys in JWKS format for external services to verify JWTs.
 * Includes proper caching headers for performance.
 */
jwksRoutes.get('/jwks.json', async (c) => {
    const env = getEnv(c.env);

    // Check if RSA keys are configured
    if (!env.rsaPrivateKey || !env.rsaPublicKey) {
        return c.json({
            error: 'JWKS not configured',
            message: 'RSA keys are not configured for this environment',
        }, 503);
    }

    try {
        const jwksService = createJWKSService(
            env.rsaPrivateKey,
            env.rsaPublicKey,
            env.rsaKeyId || 'orka-auth-key-1'
        );

        const jwks = await jwksService.getJWKS();

        // Set caching headers
        c.header('Cache-Control', `public, max-age=${JWKS_CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${JWKS_STALE_WHILE_REVALIDATE_SECONDS}`);
        c.header('Content-Type', 'application/json');

        return c.json(jwks);
    } catch (error) {
        logger.error('JWKS generation failed', error);
        return c.json({
            error: 'JWKS generation failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});

export default jwksRoutes;
