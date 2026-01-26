import type { AuthRepository } from '../../repositories';
import type { ServiceResult } from '../../types';
import { generateId, ok, err, nowMs, hashSHA256, generateRandomBytes, bytesToBase62 } from '../shared';
import type {
    ApiKey,
    ApiKeyCreateResult,
    ApiKeyPublic,
    ApiKeyStatus,
    CreateApiKeyInput
} from './types';

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

const KEY_PREFIX = 'oka_live_';

// Keys are stored as SHA-256 hashes. The plaintext key is only returned
// once during creation.
export class ApiKeyService {
    constructor(private repository: AuthRepository) { }

    // Returns the plaintext key only once - it cannot be retrieved later.
    async createApiKey(input: CreateApiKeyInput): Promise<ServiceResult<ApiKeyCreateResult>> {
        const now = nowMs();

        // Generate secure random key
        const { plainTextKey, keyHash, keyPrefix } = await this.generateApiKey();

        const apiKey: ApiKey = {
            id: generateId('ak'),
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

        return ok({
            apiKey: this.toPublic(apiKey),
            plainTextKey,
        });
    }

    async getApiKey(id: string): Promise<ServiceResult<ApiKeyPublic>> {
        const row = await this.repository.rawFirst<ApiKeyRow>(
            'SELECT * FROM api_keys WHERE id = ?',
            [id]
        );

        if (!row) {
            return err('API key not found');
        }

        return ok(this.toPublic(this.mapRow(row)));
    }

    async getApiKeyByHash(keyHash: string): Promise<ServiceResult<ApiKey>> {
        const row = await this.repository.rawFirst<ApiKeyRow>(
            'SELECT * FROM api_keys WHERE key_hash = ?',
            [keyHash]
        );

        if (!row) {
            return err('API key not found');
        }

        return ok(this.mapRow(row));
    }

    async listApiKeys(tenantId: string): Promise<ServiceResult<ApiKeyPublic[]>> {
        const result = await this.repository.rawAll<ApiKeyRow>(
            'SELECT * FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC',
            [tenantId]
        );

        const keys = result.results.map(row => this.toPublic(this.mapRow(row)));
        return ok(keys);
    }

    async validateApiKey(plainTextKey: string): Promise<ServiceResult<ApiKey>> {
        // Extract prefix to quick-reject invalid keys
        if (!plainTextKey.startsWith(KEY_PREFIX)) {
            return err('Invalid API key format');
        }

        const keyHash = await hashSHA256(plainTextKey);
        const result = await this.getApiKeyByHash(keyHash);

        if (!result.success || !result.data) {
            return err('Invalid API key');
        }

        const apiKey = result.data;

        // Check if revoked
        if (apiKey.status === 'revoked' || apiKey.revokedAt) {
            return err('API key has been revoked');
        }

        // Check if expired
        if (apiKey.expiresAt && apiKey.expiresAt < nowMs()) {
            return err('API key has expired');
        }

        // Update last used
        await this.repository.rawRun(
            'UPDATE api_keys SET last_used_at = ? WHERE id = ?',
            [nowMs(), apiKey.id]
        );

        return ok(apiKey);
    }

    async revokeApiKey(id: string): Promise<ServiceResult<void>> {
        const existing = await this.repository.rawFirst<ApiKeyRow>(
            'SELECT id FROM api_keys WHERE id = ?',
            [id]
        );

        if (!existing) {
            return err('API key not found');
        }

        await this.repository.rawRun(
            'UPDATE api_keys SET status = ?, revoked_at = ? WHERE id = ?',
            ['revoked', nowMs(), id]
        );

        return ok(undefined);
    }

    async updateApiKey(
        id: string,
        updates: { name?: string; scopes?: string[] }
    ): Promise<ServiceResult<ApiKeyPublic>> {
        const existing = await this.repository.rawFirst<ApiKeyRow>(
            'SELECT * FROM api_keys WHERE id = ?',
            [id]
        );

        if (!existing) {
            return err('API key not found');
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

        return ok(this.toPublic(this.mapRow(updated!)));
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
        const bytes = generateRandomBytes(32);

        // Convert to base62
        const randomPart = bytesToBase62(bytes);

        // Create the full key
        const plainTextKey = `${KEY_PREFIX}${randomPart}`;

        // Hash the key for storage
        const keyHash = await hashSHA256(plainTextKey);

        // Store a prefix for identification (first 8 chars of random part)
        const keyPrefix = `${KEY_PREFIX}${randomPart.slice(0, 8)}`;

        return { plainTextKey, keyHash, keyPrefix };
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


export function createApiKeyService(repository: AuthRepository): ApiKeyService {
    return new ApiKeyService(repository);
}
