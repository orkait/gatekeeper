import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { HTTP_STATUS } from '../constants/http';

const healthRoutes = new Hono<AppEnv>();

/**
 * GET /health
 * Health check endpoint for monitoring and uptime checks
 */
healthRoutes.get('/', async (c) => {
    try {
        // Basic health check - verify database connectivity
        const db = c.get('authDB');
        await db.first('SELECT 1 as health');

        return c.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'orkait-auth',
        }, HTTP_STATUS.OK);
    } catch (error) {
        return c.json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            service: 'orkait-auth',
            error: error instanceof Error ? error.message : 'Unknown error',
        }, HTTP_STATUS.SERVICE_UNAVAILABLE);
    }
});

/**
 * GET /health/ready
 * Readiness check - verifies all dependencies are available
 */
healthRoutes.get('/ready', async (c) => {
    const checks = {
        database: false,
        cache: false,
    };

    try {
        // Check database
        const db = c.get('authDB');
        await db.first('SELECT 1 as health');
        checks.database = true;

        // Check cache if available
        if (c.env.AUTH_CACHE) {
            await c.env.AUTH_CACHE.get('health-check');
            checks.cache = true;
        } else {
            checks.cache = true; // Optional dependency
        }

        const allHealthy = Object.values(checks).every(v => v);

        return c.json({
            status: allHealthy ? 'ready' : 'not_ready',
            timestamp: new Date().toISOString(),
            checks,
        }, allHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE);
    } catch (error) {
        return c.json({
            status: 'not_ready',
            timestamp: new Date().toISOString(),
            checks,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, HTTP_STATUS.SERVICE_UNAVAILABLE);
    }
});

export default healthRoutes;
