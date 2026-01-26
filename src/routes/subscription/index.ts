import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import handlersRouter from './handlers';
import usageRouter from './usage';

const subscriptionRoutes = new Hono<AppEnv>();

subscriptionRoutes.route('/', handlersRouter);
subscriptionRoutes.route('/usage', usageRouter);

export default subscriptionRoutes;

export { requireAuth, requireTenantMember, requireInternalAuth, type SubscriptionAuthInfo } from './middleware';
export * from './schemas';
