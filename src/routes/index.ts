import { Hono } from 'hono';
import authRoutes from './auth';
import keysRoutes from './keys';
import authorizeRoutes from './authorize';
import webhookRoutes from './webhook';
import tenantRoutes from './tenant';
import subscriptionRoutes from './subscription';
import adminRoutes from './admin';

export function createAPIRouter() {
    const api = new Hono();

    api.get('/health', (c) => c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        service: 'orkait-auth',
    }));

    api.route('/auth', authRoutes);
    api.route('/keys', keysRoutes);
    api.route('/authorize', authorizeRoutes);
    api.route('/webhooks', webhookRoutes);
    api.route('/tenants', tenantRoutes);
    api.route('/subscriptions', subscriptionRoutes);
    api.route('/admin', adminRoutes);

    return api;
}

