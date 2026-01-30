import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import handlersRouter from './handlers';

const keysRoutes = new Hono<AppEnv>();

keysRoutes.route('/', handlersRouter);

export default keysRoutes;

export { requireTenantAdmin, type KeysAuthInfo } from '../../middleware/auth-domain/keys';
export * from './schemas';
