import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import crudRouter from './crud';
import usersRouter from './users';

const tenantRoutes = new Hono<AppEnv>();

tenantRoutes.route('/', crudRouter);
tenantRoutes.route('/:id/users', usersRouter);

export default tenantRoutes;

export { requireAuth, requireTenantAdmin, type TenantAuthInfo } from './middleware';
export * from './schemas';
