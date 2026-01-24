import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from 'jose';

/**
 * Session JWT payload structure.
 * Used for user sessions with a specific service.
 */
export interface SessionJWTPayload extends JoseJWTPayload {
    sub: string;           // User ID
    tenant_id: string;     // Tenant ID
    session_id: string;    // Session ID
    aud: string;           // Audience (service name)
    exp: number;           // Expiration timestamp
}

/**
 * API Key JWT payload structure.
 * Used for API key authentication.
 */
export interface ApiKeyJWTPayload extends JoseJWTPayload {
    sub: string;           // Tenant ID
    api_key_id: string;    // API Key ID
    scope: string[];       // Scopes granted to this key
    aud: string;           // Audience (service name)
    exp: number;           // Expiration timestamp
}

/**
 * Union type for all JWT payloads.
 */
export type AuthJWTPayload = SessionJWTPayload | ApiKeyJWTPayload;

/**
 * Options for signing a session JWT.
 */
export interface SignSessionJWTOptions {
    userId: string;
    tenantId: string;
    sessionId: string;
    audience: string;
    expiresInSeconds?: number;
}

/**
 * Options for signing an API key JWT.
 */
export interface SignApiKeyJWTOptions {
    tenantId: string;
    apiKeyId: string;
    scopes: string[];
    audience: string;
    expiresInSeconds?: number;
}

/**
 * Result of JWT verification.
 */
export interface JWTVerifyResult<T extends AuthJWTPayload> {
    valid: boolean;
    payload?: T;
    error?: string;
}

/**
 * JWTService - JWT signing and verification using jose library.
 *
 * Provides type-safe JWT operations for session and API key tokens.
 * Uses HS256 algorithm with symmetric key signing.
 */
export class JWTService {
    private secret: Uint8Array;
    private defaultExpiresIn: number;

    constructor(secret: string, defaultExpiresInSeconds: number = 900) {
        this.secret = new TextEncoder().encode(secret);
        this.defaultExpiresIn = defaultExpiresInSeconds;
    }

    /**
     * Sign a session JWT for user authentication.
     */
    async signSessionJWT(options: SignSessionJWTOptions): Promise<string> {
        const expiresIn = options.expiresInSeconds ?? this.defaultExpiresIn;
        const now = Math.floor(Date.now() / 1000);

        const payload: Omit<SessionJWTPayload, 'iat' | 'exp'> = {
            sub: options.userId,
            tenant_id: options.tenantId,
            session_id: options.sessionId,
            aud: options.audience,
        };

        return new SignJWT(payload as JoseJWTPayload)
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .setIssuedAt(now)
            .setExpirationTime(now + expiresIn)
            .sign(this.secret);
    }

    /**
     * Sign an API key JWT for API authentication.
     */
    async signApiKeyJWT(options: SignApiKeyJWTOptions): Promise<string> {
        const expiresIn = options.expiresInSeconds ?? this.defaultExpiresIn;
        const now = Math.floor(Date.now() / 1000);

        const payload: Omit<ApiKeyJWTPayload, 'iat' | 'exp'> = {
            sub: options.tenantId,
            api_key_id: options.apiKeyId,
            scope: options.scopes,
            aud: options.audience,
        };

        return new SignJWT(payload as JoseJWTPayload)
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .setIssuedAt(now)
            .setExpirationTime(now + expiresIn)
            .sign(this.secret);
    }

    /**
     * Verify a session JWT.
     */
    async verifySessionJWT(
        token: string,
        expectedAudience?: string
    ): Promise<JWTVerifyResult<SessionJWTPayload>> {
        try {
            const { payload } = await jwtVerify(token, this.secret, {
                algorithms: ['HS256'],
            });

            // Validate required session fields
            if (!payload.sub || !payload.tenant_id || !payload.session_id) {
                return { valid: false, error: 'Invalid session token structure' };
            }

            // Validate audience if provided
            if (expectedAudience && payload.aud !== expectedAudience) {
                return { valid: false, error: 'Invalid audience' };
            }

            return {
                valid: true,
                payload: payload as SessionJWTPayload,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return { valid: false, error: message };
        }
    }

    /**
     * Verify an API key JWT.
     */
    async verifyApiKeyJWT(
        token: string,
        expectedAudience?: string
    ): Promise<JWTVerifyResult<ApiKeyJWTPayload>> {
        try {
            const { payload } = await jwtVerify(token, this.secret, {
                algorithms: ['HS256'],
            });

            // Validate required API key fields
            if (!payload.sub || !payload.api_key_id || !Array.isArray(payload.scope)) {
                return { valid: false, error: 'Invalid API key token structure' };
            }

            // Validate audience if provided
            if (expectedAudience && payload.aud !== expectedAudience) {
                return { valid: false, error: 'Invalid audience' };
            }

            return {
                valid: true,
                payload: payload as ApiKeyJWTPayload,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return { valid: false, error: message };
        }
    }

    /**
     * Verify any JWT and determine its type.
     * Returns the payload with a 'type' field indicating the token type.
     */
    async verifyJWT(
        token: string,
        expectedAudience?: string
    ): Promise<JWTVerifyResult<AuthJWTPayload> & { type?: 'session' | 'api_key' }> {
        try {
            const { payload } = await jwtVerify(token, this.secret, {
                algorithms: ['HS256'],
            });

            // Validate audience if provided
            if (expectedAudience && payload.aud !== expectedAudience) {
                return { valid: false, error: 'Invalid audience' };
            }

            // Determine token type based on payload structure
            if (payload.session_id && payload.tenant_id) {
                return {
                    valid: true,
                    payload: payload as SessionJWTPayload,
                    type: 'session',
                };
            } else if (payload.api_key_id && Array.isArray(payload.scope)) {
                return {
                    valid: true,
                    payload: payload as ApiKeyJWTPayload,
                    type: 'api_key',
                };
            }

            return { valid: false, error: 'Unknown token type' };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return { valid: false, error: message };
        }
    }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a JWTService instance.
 */
export function createJWTService(
    secret: string,
    defaultExpiresInSeconds?: number
): JWTService {
    return new JWTService(secret, defaultExpiresInSeconds);
}

/**
 * Sign a session JWT (convenience function).
 */
export async function signSessionJWT(
    secret: string,
    options: SignSessionJWTOptions
): Promise<string> {
    const service = new JWTService(secret);
    return service.signSessionJWT(options);
}

/**
 * Sign an API key JWT (convenience function).
 */
export async function signApiKeyJWT(
    secret: string,
    options: SignApiKeyJWTOptions
): Promise<string> {
    const service = new JWTService(secret);
    return service.signApiKeyJWT(options);
}

/**
 * Verify a JWT (convenience function).
 */
export async function verifyJWT(
    secret: string,
    token: string,
    expectedAudience?: string
): Promise<JWTVerifyResult<AuthJWTPayload> & { type?: 'session' | 'api_key' }> {
    const service = new JWTService(secret);
    return service.verifyJWT(token, expectedAudience);
}
