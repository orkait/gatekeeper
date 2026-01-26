export type ApiKeyStatus = 'active' | 'revoked';

export interface ApiKey {
    id: string;
    tenantId: string;
    keyHash: string;
    keyPrefix: string;
    name: string | null;
    scopes: string[];
    quotaLimit: number | null;
    quotaPeriod: 'hour' | 'day' | 'month' | null;
    status: ApiKeyStatus;
    createdBy: string;
    lastUsedAt: number | null;
    expiresAt: number | null;
    revokedAt: number | null;
    createdAt: number;
}

export interface ApiKeyPublic {
    id: string;
    tenantId: string;
    keyPrefix: string;
    name: string | null;
    scopes: string[];
    quotaLimit: number | null;
    quotaPeriod: 'hour' | 'day' | 'month' | null;
    status: ApiKeyStatus;
    lastUsedAt: number | null;
    expiresAt: number | null;
    createdAt: number;
}

export interface ApiKeyCreateResult {
    apiKey: ApiKeyPublic;
    plainTextKey: string;
}

export interface CreateApiKeyInput {
    tenantId: string;
    createdBy: string;
    name?: string;
    scopes?: string[];
    quotaLimit?: number;
    quotaPeriod?: 'hour' | 'day' | 'month';
    expiresInSeconds?: number;
}
