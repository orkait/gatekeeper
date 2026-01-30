import type { JWTPayload as JoseJWTPayload } from 'jose';

// Session JWT payload structure.
// Used for user sessions with a specific service.
export interface SessionJWTPayload extends JoseJWTPayload {
    sub: string;           // User ID
    tenant_id: string;     // Tenant ID
    session_id: string;    // Session ID
    aud: string;           // Audience (service name)
    exp: number;           // Expiration timestamp
}

// API Key JWT payload structure.
// Used for API key authentication.
export interface ApiKeyJWTPayload extends JoseJWTPayload {
    sub: string;           // Tenant ID
    api_key_id: string;    // API Key ID
    scope: string[];       // Scopes granted to this key
    aud: string;           // Audience (service name)
    exp: number;           // Expiration timestamp
}

// Basic JWT payload structure.
// Used for standard user authentication (signup/login).
export interface BasicJWTPayload extends JoseJWTPayload {
    sub: string;           // User ID
    email: string;         // User Email
    exp: number;           // Expiration timestamp
}

export type AuthJWTPayload = SessionJWTPayload | ApiKeyJWTPayload | BasicJWTPayload;

export interface SignSessionJWTOptions {
    userId: string;
    tenantId: string;
    sessionId: string;
    audience: string;
    expiresInSeconds?: number;
}

export interface SignApiKeyJWTOptions {
    tenantId: string;
    apiKeyId: string;
    scopes: string[];
    audience: string;
    expiresInSeconds?: number;
}

export interface JWTVerifyResult<T extends AuthJWTPayload> {
    valid: boolean;
    payload?: T;
    error?: string;
}
