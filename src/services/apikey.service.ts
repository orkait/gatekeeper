import type { AuthRepository } from '../repositories/auth.repository';
import type { ServiceResult } from '../types';

/**
 * API Key status.
 */
export type ApiKeyStatus = 'active' | 'revoked';

/**
 * API Key record in the database.
 */
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

/**
 * Public API Key (without hash).
 */
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

/**
 * Result of API key creation (includes the plaintext key once).
 */
export interface ApiKeyCreateResult {
    apiKey: ApiKeyPublic;
    plainTextKey: string;
}

/**
 * Input for creating an API key.
 */
export interface CreateApiKeyInput {
    tenantId: string;
    createdBy: string;
    name?: string;
    scopes?: string[];
    quotaLimit?: number;
    quotaPeriod?: 'hour' | 'day' | 'month';
    expiresInSeconds?: number;
}

/**
 * Database row for api_keys table.
 */
interface ApiKeyRow {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    key_hash: string;
    key_prefix: string;
    name: string | null;
    scopes: string;
    quota_limit: number | null;
    quota_period: string | null;
    status: string;
    created_by: string;
    last_used_at: number | null;
    expires_at: number | null;
    revoked_at: number | null;
    created_at: number;
}

/**
 * API Key prefix.
 */
const KEY_PREFIX = 'oka_live_';

/**
 * ApiKeyService - API key generation, storage, and management.
 *
 * Keys are stored as SHA-256 hashes. The plaintext key is only returned
 * once during creation.
 */
export class ApiKeyService {
    constructor(private repository: AuthRepository) {}

    /**
     * Generate and create a new API key.
     * Returns the plaintext key only once - it cannot be retrieved later.
     */
    async createApiKey(input: CreateApiKeyInput): Promise<ServiceResult<ApiKeyCreateResult>> {
        const now = Date.now();

        // Generate secure random key
        const { plainTextKey, keyHash, keyPrefix } = await this.generateApiKey();

        const apiKey: ApiKey = {
            id: this.generateId('ak'),
            tenantId: input.tenantId,
            keyHash,
            keyPrefix,
            name: input.name ?? null,
            scopes: input.scopes ?? [],
            quotaLimit: input.quotaLimit ?? null,
            quotaPeriod: input.quotaPeriod ?? null,
            status: 'active',
            createdBy: input.createdBy,
            lastUsedAt: null,
            expiresAt: input.expiresInSeconds ? now + input.expiresInSeconds * 1000 : null,
            revokedAt: null,
            createdAt: now,
        };

        // Store in database
        await this.repository.rawRun(
            `INSERT INTO api_keys (id, tenant_id, key_hash, key_prefix, name, scopes, quota_limit, quota_period, status, created_by, last_used_at, expires_at, revoked_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                apiKey.id,
                apiKey.tenantId,
                apiKey.keyHash,
                apiKey.keyPrefix,
                apiKey.name,
                JSON.stringify(apiKey.scopes),
                apiKey.quotaLimit,
                apiKey.quotaPeriod,
                apiKey.status,
                apiKey.createdBy,
                apiKey.lastUsedAt,
                apiKey.expiresAt,
                apiKey.revokedAt,
                apiKey.createdAt,
            ]
        );

        return {
            success: true,
            data: {
                apiKey: this.toPublic(apiKey),
                plainTextKey,
            },
        };
    }

    /**
     * Get an API key by ID (returns public info only).
     */
    async getApiKey(id: string): Promise<ServiceResult<ApiKeyPublic>> {
        const row = await this.repository.rawFirst<ApiKeyRow>(
            'SELECT * FROM api_keys WHERE id = ?',
            [id]
        );

        if (!row) {
            return { success: false, error: 'API key not found' };
        }

        return { success: true, data: this.toPublic(this.mapRow(row)) };
    }

    /**
     * Get an API key by hash (for validation).
     */
    async getApiKeyByHash(keyHash: string): Promise<ServiceResult<ApiKey>> {
        const row = await this.repository.rawFirst<ApiKeyRow>(
            'SELECT * FROM api_keys WHERE key_hash = ?',
            [keyHash]
        );

        if (!row) {
            return { success: false, error: 'API key not found' };
        }

        return { success: true, data: this.mapRow(row) };
    }

    /**
     * List all API keys for a tenant (returns public info only).
     */
    async listApiKeys(tenantId: string): Promise<ServiceResult<ApiKeyPublic[]>> {
        const result = await this.repository.rawAll<ApiKeyRow>(
            'SELECT * FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC',
            [tenantId]
        );

        const keys = result.results.map(row => this.toPublic(this.mapRow(row)));
        return { success: true, data: keys };
    }

    /**
     * Validate an API key and return the full record if valid.
     */
    async validateApiKey(plainTextKey: string): Promise<ServiceResult<ApiKey>> {
        // Extract prefix to quick-reject invalid keys
        if (!plainTextKey.startsWith(KEY_PREFIX)) {
            return { success: false, error: 'Invalid API key format' };
        }

        const keyHash = await this.hashKey(plainTextKey);
        const result = await this.getApiKeyByHash(keyHash);

        if (!result.success || !result.data) {
            return { success: false, error: 'Invalid API key' };
        }

        const apiKey = result.data;

        // Check if revoked
        if (apiKey.status === 'revoked' || apiKey.revokedAt) {
            return { success: false, error: 'API key has been revoked' };
        }

        // Check if expired
        if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) {
            return { success: false, error: 'API key has expired' };
        }

        // Update last used
        await this.repository.rawRun(
            'UPDATE api_keys SET last_used_at = ? WHERE id = ?',
            [Date.now(), apiKey.id]
        );

        return { success: true, data: apiKey };
    }

    /**
     * Revoke an API key.
     */
    async revokeApiKey(id: string): Promise<ServiceResult<void>> {
        const existing = await this.repository.rawFirst<ApiKeyRow>(
            'SELECT id FROM api_keys WHERE id = ?',
            [id]
        );

        if (!existing) {
            return { success: false, error: 'API key not found' };
        }

        await this.repository.rawRun(
            'UPDATE api_keys SET status = ?, revoked_at = ? WHERE id = ?',
            ['revoked', Date.now(), id]
        );

        return { success: true };
    }

    /**
     * Update an API key's name or scopes.
     */
    async updateApiKey(
        id: string,
        updates: { name?: string; scopes?: string[] }
    ): Promise<ServiceResult<ApiKeyPublic>> {
        const existing = await this.repository.rawFirst<ApiKeyRow>(
            'SELECT * FROM api_keys WHERE id = ?',
            [id]
        );

        if (!existing) {
            return { success: false, error: 'API key not found' };
        }

        const fields: string[] = [];
        const values: unknown[] = [];

        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.scopes !== undefined) {
            fields.push('scopes = ?');
            values.push(JSON.stringify(updates.scopes));
        }

        if (fields.length > 0) {
            values.push(id);
            await this.repository.rawRun(
                `UPDATE api_keys SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        }

        const updated = await this.repository.rawFirst<ApiKeyRow>(
            'SELECT * FROM api_keys WHERE id = ?',
            [id]
        );

        return { success: true, data: this.toPublic(this.mapRow(updated!)) };
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private async generateApiKey(): Promise<{
        plainTextKey: string;
        keyHash: string;
        keyPrefix: string;
    }> {
        // Generate 32 bytes of random data
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);

        // Convert to base62
        const randomPart = this.bytesToBase62(bytes);

        // Create the full key
        const plainTextKey = `${KEY_PREFIX}${randomPart}`;

        // Hash the key for storage
        const keyHash = await this.hashKey(plainTextKey);

        // Store a prefix for identification (first 8 chars of random part)
        const keyPrefix = `${KEY_PREFIX}${randomPart.slice(0, 8)}`;

        return { plainTextKey, keyHash, keyPrefix };
    }

    private async hashKey(key: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(key);
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

    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    private mapRow(row: ApiKeyRow): ApiKey {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            keyHash: row.key_hash,
            keyPrefix: row.key_prefix,
            name: row.name,
            scopes: JSON.parse(row.scopes || '[]'),
            quotaLimit: row.quota_limit,
            quotaPeriod: row.quota_period as 'hour' | 'day' | 'month' | null,
            status: row.status as ApiKeyStatus,
            createdBy: row.created_by,
            lastUsedAt: row.last_used_at,
            expiresAt: row.expires_at,
            revokedAt: row.revoked_at,
            createdAt: row.created_at,
        };
    }

    private toPublic(apiKey: ApiKey): ApiKeyPublic {
        return {
            id: apiKey.id,
            tenantId: apiKey.tenantId,
            keyPrefix: apiKey.keyPrefix,
            name: apiKey.name,
            scopes: apiKey.scopes,
            quotaLimit: apiKey.quotaLimit,
            quotaPeriod: apiKey.quotaPeriod,
            status: apiKey.status,
            lastUsedAt: apiKey.lastUsedAt,
            expiresAt: apiKey.expiresAt,
            createdAt: apiKey.createdAt,
        };
    }
}

/**
 * Create an ApiKeyService instance.
 */
export function createApiKeyService(repository: AuthRepository): ApiKeyService {
    return new ApiKeyService(repository);
}
