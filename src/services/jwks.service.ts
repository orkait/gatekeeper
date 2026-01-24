import {
    SignJWT,
    jwtVerify,
    importPKCS8,
    importSPKI,
    exportJWK,
    type JWK,
    type CryptoKey,
    type JWTPayload as JoseJWTPayload,
} from 'jose';
import type { SessionJWTPayload, ApiKeyJWTPayload, AuthJWTPayload, JWTVerifyResult, SignSessionJWTOptions, SignApiKeyJWTOptions } from './jwt.service';

/**
 * JWKS (JSON Web Key Set) structure.
 */
export interface JWKS {
    keys: JWK[];
}

/**
 * JWKSService - Asymmetric JWT signing and JWKS endpoint support.
 *
 * Uses RS256 algorithm with RSA key pairs. The private key is used for signing,
 * and the public key is exposed via JWKS for external services to verify tokens.
 */
export class JWKSService {
    private privateKey: CryptoKey | null = null;
    private publicKey: CryptoKey | null = null;
    private keyId: string;
    private defaultExpiresIn: number;
    private initialized: boolean = false;

    constructor(
        private privateKeyPem: string,
        private publicKeyPem: string,
        keyId: string = 'orka-auth-key-1',
        defaultExpiresInSeconds: number = 900
    ) {
        this.keyId = keyId;
        this.defaultExpiresIn = defaultExpiresInSeconds;
    }

    /**
     * Initialize the service by importing the keys.
     * Must be called before signing or verification.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        this.privateKey = await importPKCS8(this.privateKeyPem, 'RS256');
        this.publicKey = await importSPKI(this.publicKeyPem, 'RS256');
        this.initialized = true;
    }

    /**
     * Get the JWKS for public key distribution.
     */
    async getJWKS(): Promise<JWKS> {
        await this.initialize();

        const jwk = await exportJWK(this.publicKey!);
        jwk.kid = this.keyId;
        jwk.alg = 'RS256';
        jwk.use = 'sig';

        return { keys: [jwk] };
    }

    /**
     * Sign a session JWT for user authentication.
     */
    async signSessionJWT(options: SignSessionJWTOptions): Promise<string> {
        await this.initialize();

        const expiresIn = options.expiresInSeconds ?? this.defaultExpiresIn;
        const now = Math.floor(Date.now() / 1000);

        const payload: Omit<SessionJWTPayload, 'iat' | 'exp'> = {
            sub: options.userId,
            tenant_id: options.tenantId,
            session_id: options.sessionId,
            aud: options.audience,
        };

        return new SignJWT(payload as JoseJWTPayload)
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: this.keyId })
            .setIssuedAt(now)
            .setExpirationTime(now + expiresIn)
            .sign(this.privateKey!);
    }

    /**
     * Sign an API key JWT for API authentication.
     */
    async signApiKeyJWT(options: SignApiKeyJWTOptions): Promise<string> {
        await this.initialize();

        const expiresIn = options.expiresInSeconds ?? this.defaultExpiresIn;
        const now = Math.floor(Date.now() / 1000);

        const payload: Omit<ApiKeyJWTPayload, 'iat' | 'exp'> = {
            sub: options.tenantId,
            api_key_id: options.apiKeyId,
            scope: options.scopes,
            aud: options.audience,
        };

        return new SignJWT(payload as JoseJWTPayload)
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: this.keyId })
            .setIssuedAt(now)
            .setExpirationTime(now + expiresIn)
            .sign(this.privateKey!);
    }

    /**
     * Verify a session JWT.
     */
    async verifySessionJWT(
        token: string,
        expectedAudience?: string
    ): Promise<JWTVerifyResult<SessionJWTPayload>> {
        await this.initialize();

        try {
            const { payload } = await jwtVerify(token, this.publicKey!, {
                algorithms: ['RS256'],
            });

            if (!payload.sub || !payload.tenant_id || !payload.session_id) {
                return { valid: false, error: 'Invalid session token structure' };
            }

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
        await this.initialize();

        try {
            const { payload } = await jwtVerify(token, this.publicKey!, {
                algorithms: ['RS256'],
            });

            if (!payload.sub || !payload.api_key_id || !Array.isArray(payload.scope)) {
                return { valid: false, error: 'Invalid API key token structure' };
            }

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
     */
    async verifyJWT(
        token: string,
        expectedAudience?: string
    ): Promise<JWTVerifyResult<AuthJWTPayload> & { type?: 'session' | 'api_key' }> {
        await this.initialize();

        try {
            const { payload } = await jwtVerify(token, this.publicKey!, {
                algorithms: ['RS256'],
            });

            if (expectedAudience && payload.aud !== expectedAudience) {
                return { valid: false, error: 'Invalid audience' };
            }

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

/**
 * Create a JWKSService instance.
 */
export function createJWKSService(
    privateKeyPem: string,
    publicKeyPem: string,
    keyId?: string,
    defaultExpiresInSeconds?: number
): JWKSService {
    return new JWKSService(privateKeyPem, publicKeyPem, keyId, defaultExpiresInSeconds);
}
