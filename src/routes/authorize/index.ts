import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import handlersRouter from './handlers';

const authorizeRoutes = new Hono<AppEnv>();

authorizeRoutes.route('/', handlersRouter);

export default authorizeRoutes;

export * from './schemas';
