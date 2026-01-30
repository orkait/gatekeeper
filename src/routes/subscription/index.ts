import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import handlersRouter from './handlers';
import usageRouter from './usage';

const subscriptionRoutes = new Hono<AppEnv>();

subscriptionRoutes.route('/', handlersRouter);
subscriptionRoutes.route('/usage', usageRouter);

export default subscriptionRoutes;

export { requireTenantMember, requireTenantAdmin, requireInternalAuth } from '../../middleware/auth-domain/subscription';
export * from './schemas';
