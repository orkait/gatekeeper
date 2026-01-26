import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import flagsRouter from './flags';
import overridesRouter from './overrides';

const adminRoutes = new Hono<AppEnv>();

adminRoutes.route('/flags', flagsRouter);
adminRoutes.route('/overrides', overridesRouter);

export default adminRoutes;

export { requireAdmin, type AdminAuthInfo } from './middleware';
export * from './schemas';
