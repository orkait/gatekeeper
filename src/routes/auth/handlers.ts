import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { AuthService } from '../../services/auth';
import { SignupSchema, LoginSchema, GoogleAuthSchema, RefreshTokenSchema, VerifyEmailSchema, ResendVerificationSchema } from './schemas';
import { authMiddleware, getAuth } from '../../middleware/auth-domain/core';

export type AuthRoutesEnv = {
    Variables: { authService: AuthService };
};

const handlersRouter = new Hono<AuthRoutesEnv>();

handlersRouter.post('/signup', zValidator('json', SignupSchema, (result, _c) => {
    if (!result.success) {
        throw new HTTPException(400, {
            message: 'Validation failed',
            cause: result.error.flatten(),
        });
    }
}), async (c) => {
    const authService = c.get('authService');
    const input = c.req.valid('json');

    const result = await authService.signup(input);

    if (!result.success) {
        // Return 409 Conflict for duplicate email, 400 Bad Request for other errors
        const statusCode = result.error === 'Email already registered' ? 409 : 400;
        throw new HTTPException(statusCode, { message: result.error || 'Signup failed' });
    }

    return c.json({ success: true, data: result.data }, 201);
});

handlersRouter.post('/login', zValidator('json', LoginSchema, (result, _c) => {
    if (!result.success) {
        throw new HTTPException(400, {
            message: 'Validation failed',
            cause: result.error.flatten(),
        });
    }
}), async (c) => {
    const authService = c.get('authService');
    const input = c.req.valid('json');

    const result = await authService.login(input);

    if (!result.success) {
        throw new HTTPException(401, { message: result.error || 'Invalid credentials' });
    }

    return c.json({ success: true, data: result.data });
});

handlersRouter.post('/google', zValidator('json', GoogleAuthSchema, (result, _c) => {
    if (!result.success) {
        throw new HTTPException(400, {
            message: 'Validation failed',
            cause: result.error.flatten(),
        });
    }
}), async (c) => {
    const authService = c.get('authService');
    const input = c.req.valid('json');

    const result = await authService.googleAuth(input.idToken);

    if (!result.success) {
        throw new HTTPException(401, { message: result.error || 'Invalid Google token' });
    }

    return c.json({ success: true, data: result.data });
});

handlersRouter.post('/refresh', zValidator('json', RefreshTokenSchema, (result, _c) => {
    if (!result.success) {
        throw new HTTPException(400, {
            message: 'Validation failed',
            cause: result.error.flatten(),
        });
    }
}), async (c) => {
    const authService = c.get('authService');
    const input = c.req.valid('json');

    const result = await authService.refreshAccessToken(input.refreshToken);

    if (!result.success) {
        throw new HTTPException(401, { message: result.error || 'Invalid refresh token' });
    }

    return c.json({ success: true, data: result.data });
});

handlersRouter.post('/logout', authMiddleware, zValidator('json', RefreshTokenSchema, (result, _c) => {
    if (!result.success) {
        throw new HTTPException(400, {
            message: 'Validation failed',
            cause: result.error.flatten(),
        });
    }
}), async (c) => {
    const authService = c.get('authService');
    const input = c.req.valid('json');

    await authService.logout(input.refreshToken);

    return c.json({ success: true, message: 'Logged out successfully' });
});

handlersRouter.post('/logout-all', authMiddleware, async (c) => {
    const authService = c.get('authService');
    const auth = getAuth(c);

    await authService.logoutAll(auth.userId);

    return c.json({ success: true, message: 'Logged out from all devices' });
});

handlersRouter.post('/verify-email', zValidator('json', VerifyEmailSchema, (result, _c) => {
    if (!result.success) {
        throw new HTTPException(400, {
            message: 'Validation failed',
            cause: result.error.flatten(),
        });
    }
}), async (c) => {
    const authService = c.get('authService');
    const input = c.req.valid('json');

    const result = await authService.verifyEmail(input.token);

    if (!result.success) {
        throw new HTTPException(400, { message: result.error || 'Verification failed' });
    }

    return c.json({ success: true, message: result.data?.message || 'Email verified successfully' });
});

handlersRouter.post('/resend-verification', zValidator('json', ResendVerificationSchema, (result, _c) => {
    if (!result.success) {
        throw new HTTPException(400, {
            message: 'Validation failed',
            cause: result.error.flatten(),
        });
    }
}), async (c) => {
    const authService = c.get('authService');
    const input = c.req.valid('json');

    const result = await authService.resendVerificationEmail(input.email);

    if (!result.success) {
        throw new HTTPException(400, { message: result.error || 'Failed to resend verification email' });
    }

    return c.json({ success: true, message: result.data?.message || 'Verification email sent' });
});

export default handlersRouter;
