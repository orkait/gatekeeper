import type { AuthRepository, Session } from '../repositories/auth.repository';
import type { JWTService } from './jwt.service';
import type { ServiceResult } from '../types';

/**
 * Input for creating a session.
 */
export interface CreateSessionInput {
    userId: string;
    tenantId: string;
    service: string;
    deviceInfo?: string;
    ipAddress?: string;
    expiresInSeconds?: number;
}

/**
 * Result of session creation with tokens.
 */
export interface SessionTokens {
    session: Session;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

/**
 * SessionService - Per-service session management.
 *
 * Handles creation, retrieval, and revocation of sessions with one session
 * per user+tenant+service combination.
 */
export class SessionService {
    private defaultExpiresIn: number;
    private refreshTokenExpiresIn: number;

    constructor(
        private repository: AuthRepository,
        private jwtService: JWTService,
        defaultExpiresInSeconds: number = 900,
        refreshTokenExpiresInSeconds: number = 604800
    ) {
        this.defaultExpiresIn = defaultExpiresInSeconds;
        this.refreshTokenExpiresIn = refreshTokenExpiresInSeconds;
    }

    /**
     * Create or update a session for a specific service.
     * Uses upsert semantics - if a session exists for user+tenant+service, it's updated.
     */
    async createSession(input: CreateSessionInput): Promise<ServiceResult<SessionTokens>> {
        const expiresIn = input.expiresInSeconds ?? this.defaultExpiresIn;

        // Check for existing session
        const existing = await this.repository.getSessionByUserAndService(
            input.userId,
            input.tenantId,
            input.service
        );

        const now = Date.now();
        const refreshToken = await this.generateRefreshToken();
        const refreshTokenHash = await this.hashToken(refreshToken);
        const sessionExpiresAt = now + this.refreshTokenExpiresIn * 1000;

        let session: Session;

        if (existing) {
            // Update existing session
            await this.repository.updateSession(existing.id, {
                refreshTokenHash,
                deviceInfo: input.deviceInfo ?? null,
                ipAddress: input.ipAddress ?? null,
                expiresAt: sessionExpiresAt,
            });
            session = (await this.repository.getSessionById(existing.id))!;
        } else {
            // Create new session
            session = {
                id: this.generateId('sess'),
                userId: input.userId,
                tenantId: input.tenantId,
                service: input.service,
                refreshTokenHash,
                deviceInfo: input.deviceInfo ?? null,
                ipAddress: input.ipAddress ?? null,
                expiresAt: sessionExpiresAt,
                createdAt: now,
                updatedAt: now,
                revokedAt: null,
            };
            await this.repository.createSession(session);
        }

        // Generate access token with service as audience
        const accessToken = await this.jwtService.signSessionJWT({
            userId: input.userId,
            tenantId: input.tenantId,
            sessionId: session.id,
            audience: input.service,
            expiresInSeconds: expiresIn,
        });

        return {
            success: true,
            data: {
                session,
                accessToken,
                refreshToken,
                expiresIn,
            },
        };
    }

    /**
     * Get a session by ID.
     */
    async getSession(sessionId: string): Promise<ServiceResult<Session>> {
        const session = await this.repository.getSessionById(sessionId);
        if (!session) {
            return { success: false, error: 'Session not found' };
        }

        // Check if session is expired
        if (session.expiresAt < Date.now()) {
            await this.repository.revokeSession(sessionId);
            return { success: false, error: 'Session expired' };
        }

        return { success: true, data: session };
    }

    /**
     * Get a session for a specific user, tenant, and service.
     */
    async getSessionForService(
        userId: string,
        tenantId: string,
        service: string
    ): Promise<ServiceResult<Session>> {
        const session = await this.repository.getSessionByUserAndService(
            userId,
            tenantId,
            service
        );

        if (!session) {
            return { success: false, error: 'Session not found' };
        }

        if (session.expiresAt < Date.now()) {
            await this.repository.revokeSession(session.id);
            return { success: false, error: 'Session expired' };
        }

        return { success: true, data: session };
    }

    /**
     * Refresh a session using a refresh token.
     */
    async refreshSession(
        refreshToken: string,
        service: string
    ): Promise<ServiceResult<SessionTokens>> {
        const tokenHash = await this.hashToken(refreshToken);
        const session = await this.repository.getSessionByRefreshTokenHash(tokenHash);

        if (!session) {
            return { success: false, error: 'Invalid refresh token' };
        }

        if (session.expiresAt < Date.now()) {
            await this.repository.revokeSession(session.id);
            return { success: false, error: 'Session expired' };
        }

        // Verify service matches
        if (session.service !== service) {
            return { success: false, error: 'Service mismatch' };
        }

        // Rotate refresh token
        const newRefreshToken = await this.generateRefreshToken();
        const newRefreshTokenHash = await this.hashToken(newRefreshToken);

        await this.repository.updateSession(session.id, {
            refreshTokenHash: newRefreshTokenHash,
            expiresAt: Date.now() + this.refreshTokenExpiresIn * 1000,
        });

        const updatedSession = (await this.repository.getSessionById(session.id))!;

        // Generate new access token
        const accessToken = await this.jwtService.signSessionJWT({
            userId: session.userId,
            tenantId: session.tenantId!,
            sessionId: session.id,
            audience: session.service,
            expiresInSeconds: this.defaultExpiresIn,
        });

        return {
            success: true,
            data: {
                session: updatedSession,
                accessToken,
                refreshToken: newRefreshToken,
                expiresIn: this.defaultExpiresIn,
            },
        };
    }

    /**
     * Get all sessions for a user.
     */
    async getUserSessions(userId: string): Promise<ServiceResult<Session[]>> {
        const sessions = await this.repository.getUserSessions(userId);
        const now = Date.now();

        // Filter out expired sessions
        const activeSessions = sessions.filter(s => s.expiresAt > now);

        return { success: true, data: activeSessions };
    }

    /**
     * Logout from a specific service (revoke session).
     */
    async logoutService(userId: string, service: string): Promise<ServiceResult<void>> {
        await this.repository.revokeUserServiceSession(userId, service);
        return { success: true };
    }

    /**
     * Logout from all services (revoke all sessions).
     */
    async logoutAll(userId: string): Promise<ServiceResult<void>> {
        await this.repository.revokeUserSessions(userId);
        return { success: true };
    }

    /**
     * Revoke a specific session by ID.
     */
    async revokeSession(sessionId: string): Promise<ServiceResult<void>> {
        const session = await this.repository.getSessionById(sessionId);
        if (!session) {
            return { success: false, error: 'Session not found' };
        }

        await this.repository.revokeSession(sessionId);
        return { success: true };
    }

    /**
     * Validate an access token and return the session.
     */
    async validateAccessToken(
        token: string,
        expectedService?: string
    ): Promise<ServiceResult<Session>> {
        const result = await this.jwtService.verifySessionJWT(token, expectedService);

        if (!result.valid || !result.payload) {
            return { success: false, error: result.error || 'Invalid token' };
        }

        const session = await this.repository.getSessionById(result.payload.session_id);
        if (!session) {
            return { success: false, error: 'Session not found' };
        }

        if (session.revokedAt) {
            return { success: false, error: 'Session revoked' };
        }

        if (session.expiresAt < Date.now()) {
            return { success: false, error: 'Session expired' };
        }

        return { success: true, data: session };
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    private async generateRefreshToken(): Promise<string> {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        return this.bytesToBase62(bytes);
    }

    private async hashToken(token: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    private bytesToBase62(bytes: Uint8Array): string {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let result = '';
        for (const byte of bytes) {
            result += chars[byte % 62];
        }
        return result;
    }
}

/**
 * Create a SessionService instance.
 */
export function createSessionService(
    repository: AuthRepository,
    jwtService: JWTService,
    defaultExpiresInSeconds?: number,
    refreshTokenExpiresInSeconds?: number
): SessionService {
    return new SessionService(
        repository,
        jwtService,
        defaultExpiresInSeconds,
        refreshTokenExpiresInSeconds
    );
}
