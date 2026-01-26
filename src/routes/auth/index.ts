import { Hono } from 'hono';
import type { AuthService } from '../../services/auth';
import handlersRouter from './handlers';
import apikeyRouter from './apikey';

export type AuthRoutesEnv = {
    Variables: { authService: AuthService };
};

const authRoutes = new Hono<AuthRoutesEnv>();

authRoutes.route('/', handlersRouter);
authRoutes.route('/apikey', apikeyRouter);

export default authRoutes;

export { authMiddleware, internalAuthMiddleware, getAuth, type AuthContext } from './middleware';
export * from './schemas';
