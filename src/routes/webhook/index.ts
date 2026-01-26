import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import handlersRouter from './handlers';

const webhookRoutes = new Hono<AppEnv>();

webhookRoutes.route('/', handlersRouter);

export default webhookRoutes;

export { requireAuth, type WebhookAuthInfo } from './middleware';
export * from './schemas';
