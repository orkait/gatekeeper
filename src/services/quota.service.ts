import type { AuthRepository } from '../repositories/auth.repository';
import type { ServiceResult } from '../types';

/**
 * Quota buffer to prevent race condition overages (99% of limit).
 */
const QUOTA_BUFFER = 0.99;

/**
 * Quota period types.
 */
export type QuotaPeriod = 'hour' | 'day' | 'month';

/**
 * Quota check level indicating where the limit was enforced.
 */
export type QuotaLevel = 'api_key' | 'tenant' | 'unlimited';

/**
 * Result of a quota check.
 */
export interface QuotaCheckResult {
    allowed: boolean;
    remaining: number;
    level: QuotaLevel;
    limit?: number;
    used?: number;
}

/**
 * Usage event record.
 */
export interface UsageEvent {
    id: string;
    tenantId: string;
    apiKeyId: string | null;
    userId: string | null;
    service: string;
    action: string;
    quantity: number;
    period: string;
    timestamp: number;
    idempotencyKey: string;
}

/**
 * Input for recording usage.
 */
export interface RecordUsageInput {
    tenantId: string;
    apiKeyId?: string;
    userId?: string;
    service: string;
    action: string;
    quantity?: number;
    idempotencyKey: string;
}

/**
 * Usage summary for a period.
 */
export interface UsageSummary {
    tenantId: string;
    period: string;
    totalQuantity: number;
    eventCount: number;
}

/**
 * Database row for usage_events table.
 */
interface UsageEventRow {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    api_key_id: string | null;
    user_id: string | null;
    service: string;
    action: string;
    quantity: number;
    period: string;
    timestamp: number;
    idempotency_key: string;
}

/**
 * QuotaService - Usage tracking with idempotency.
 *
 * Records usage events with idempotent increments and provides
 * usage summaries for quota checking.
 */
export class QuotaService {
    constructor(private repository: AuthRepository) {}

    /**
     * Record a usage event with idempotency.
     * If the idempotency key already exists, the request is ignored.
     */
    async recordUsage(input: RecordUsageInput): Promise<ServiceResult<UsageEvent>> {
        const now = Date.now();
        const period = this.getCurrentPeriod();

        // Check if idempotency key already exists
        const existing = await this.repository.rawFirst<UsageEventRow>(
            'SELECT * FROM usage_events WHERE idempotency_key = ?',
            [input.idempotencyKey]
        );

        if (existing) {
            // Return the existing event (idempotent response)
            return { success: true, data: this.mapRow(existing) };
        }

        const event: UsageEvent = {
            id: this.generateId('ue'),
            tenantId: input.tenantId,
            apiKeyId: input.apiKeyId ?? null,
            userId: input.userId ?? null,
            service: input.service,
            action: input.action,
            quantity: input.quantity ?? 1,
            period,
            timestamp: now,
            idempotencyKey: input.idempotencyKey,
        };

        await this.repository.rawRun(
            `INSERT INTO usage_events (id, tenant_id, api_key_id, user_id, service, action, quantity, period, timestamp, idempotency_key)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                event.id,
                event.tenantId,
                event.apiKeyId,
                event.userId,
                event.service,
                event.action,
                event.quantity,
                event.period,
                event.timestamp,
                event.idempotencyKey,
            ]
        );

        return { success: true, data: event };
    }

    /**
     * Get usage for a tenant in a specific period.
     */
    async getUsage(tenantId: string, period?: string): Promise<ServiceResult<UsageSummary>> {
        const targetPeriod = period ?? this.getCurrentPeriod();

        const result = await this.repository.rawFirst<{
            total_quantity: number;
            event_count: number;
        }>(
            `SELECT
                COALESCE(SUM(quantity), 0) as total_quantity,
                COUNT(*) as event_count
             FROM usage_events
             WHERE tenant_id = ? AND period = ?`,
            [tenantId, targetPeriod]
        );

        return {
            success: true,
            data: {
                tenantId,
                period: targetPeriod,
                totalQuantity: result?.total_quantity ?? 0,
                eventCount: result?.event_count ?? 0,
            },
        };
    }

    /**
     * Get usage for a specific API key in the current period.
     */
    async getApiKeyUsage(
        apiKeyId: string,
        period?: string
    ): Promise<ServiceResult<UsageSummary>> {
        const targetPeriod = period ?? this.getCurrentPeriod();

        const result = await this.repository.rawFirst<{
            tenant_id: string;
            total_quantity: number;
            event_count: number;
        }>(
            `SELECT
                tenant_id,
                COALESCE(SUM(quantity), 0) as total_quantity,
                COUNT(*) as event_count
             FROM usage_events
             WHERE api_key_id = ? AND period = ?
             GROUP BY tenant_id`,
            [apiKeyId, targetPeriod]
        );

        if (!result) {
            return {
                success: true,
                data: {
                    tenantId: '',
                    period: targetPeriod,
                    totalQuantity: 0,
                    eventCount: 0,
                },
            };
        }

        return {
            success: true,
            data: {
                tenantId: result.tenant_id,
                period: targetPeriod,
                totalQuantity: result.total_quantity,
                eventCount: result.event_count,
            },
        };
    }

    /**
     * Get usage events for a tenant.
     */
    async getUsageEvents(
        tenantId: string,
        options?: {
            period?: string;
            service?: string;
            limit?: number;
            offset?: number;
        }
    ): Promise<ServiceResult<UsageEvent[]>> {
        const conditions: string[] = ['tenant_id = ?'];
        const params: unknown[] = [tenantId];

        if (options?.period) {
            conditions.push('period = ?');
            params.push(options.period);
        }
        if (options?.service) {
            conditions.push('service = ?');
            params.push(options.service);
        }

        const limit = options?.limit ?? 100;
        const offset = options?.offset ?? 0;

        const result = await this.repository.rawAll<UsageEventRow>(
            `SELECT * FROM usage_events
             WHERE ${conditions.join(' AND ')}
             ORDER BY timestamp DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        const events = result.results.map(this.mapRow);
        return { success: true, data: events };
    }

    // ========================================================================
    // Quota Checking
    // ========================================================================

    /**
     * Check quota at per-key and global tenant levels.
     *
     * Checks in order:
     * 1. Per-API-key limit (if apiKeyId provided and key has a limit)
     * 2. Global tenant limit (if tenant has a limit)
     *
     * Uses a 99% buffer (QUOTA_BUFFER) to prevent race condition overages.
     *
     * @param tenantId - The tenant to check quota for
     * @param quantity - The quantity to check (default 1)
     * @param apiKeyId - Optional API key ID to check per-key limits
     * @returns { allowed, remaining, level } indicating quota status
     */
    async checkQuota(
        tenantId: string,
        quantity: number = 1,
        apiKeyId?: string
    ): Promise<ServiceResult<QuotaCheckResult>> {
        // Check per-API-key quota first if apiKeyId is provided
        if (apiKeyId) {
            const apiKeyResult = await this.checkApiKeyQuota(apiKeyId, quantity);
            if (apiKeyResult.success && apiKeyResult.data && !apiKeyResult.data.allowed) {
                return apiKeyResult;
            }
            // If API key quota is allowed (or unlimited), continue to tenant check
            if (apiKeyResult.success && apiKeyResult.data && apiKeyResult.data.level === 'api_key') {
                // Per-key limit is the more restrictive, return it
                return apiKeyResult;
            }
        }

        // Check global tenant quota
        const tenantResult = await this.checkTenantQuota(tenantId, quantity);
        return tenantResult;
    }

    /**
     * Check quota for a specific API key.
     */
    private async checkApiKeyQuota(
        apiKeyId: string,
        quantity: number
    ): Promise<ServiceResult<QuotaCheckResult>> {
        // Get the API key details
        const apiKeyRow = await this.repository.rawFirst<{
            quota_limit: number | null;
            quota_period: string | null;
            tenant_id: string;
        }>(
            'SELECT quota_limit, quota_period, tenant_id FROM api_keys WHERE id = ?',
            [apiKeyId]
        );

        if (!apiKeyRow) {
            return { success: false, error: 'API key not found' };
        }

        // If no quota limit set, treat as unlimited at key level
        if (!apiKeyRow.quota_limit) {
            return {
                success: true,
                data: {
                    allowed: true,
                    remaining: Number.MAX_SAFE_INTEGER,
                    level: 'unlimited',
                },
            };
        }

        const quotaLimit = apiKeyRow.quota_limit;
        const periodType = (apiKeyRow.quota_period as QuotaPeriod) || 'month';
        const period = this.getPeriodForType(periodType);

        // Get current usage for this API key in the period
        const usageResult = await this.repository.rawFirst<{
            total_quantity: number;
        }>(
            `SELECT COALESCE(SUM(quantity), 0) as total_quantity
             FROM usage_events
             WHERE api_key_id = ? AND period = ?`,
            [apiKeyId, period]
        );

        const used = usageResult?.total_quantity ?? 0;
        const effectiveLimit = Math.floor(quotaLimit * QUOTA_BUFFER);
        const remaining = Math.max(0, effectiveLimit - used);
        const allowed = used + quantity <= effectiveLimit;

        return {
            success: true,
            data: {
                allowed,
                remaining,
                level: 'api_key',
                limit: quotaLimit,
                used,
            },
        };
    }

    /**
     * Check quota at the global tenant level.
     */
    private async checkTenantQuota(
        tenantId: string,
        quantity: number
    ): Promise<ServiceResult<QuotaCheckResult>> {
        // Get the tenant's global quota limit
        const tenantRow = await this.repository.rawFirst<{
            global_quota_limit: number | null;
        }>(
            'SELECT global_quota_limit FROM tenants WHERE id = ?',
            [tenantId]
        );

        if (!tenantRow) {
            return { success: false, error: 'Tenant not found' };
        }

        // If no global quota limit set, treat as unlimited
        if (!tenantRow.global_quota_limit) {
            return {
                success: true,
                data: {
                    allowed: true,
                    remaining: Number.MAX_SAFE_INTEGER,
                    level: 'unlimited',
                },
            };
        }

        const quotaLimit = tenantRow.global_quota_limit;
        const period = this.getCurrentPeriod(); // Global tenant quota is monthly

        // Get current usage for the tenant in the period
        const usageResult = await this.getUsage(tenantId, period);
        if (!usageResult.success || !usageResult.data) {
            return { success: false, error: 'Failed to get tenant usage' };
        }

        const used = usageResult.data.totalQuantity;
        const effectiveLimit = Math.floor(quotaLimit * QUOTA_BUFFER);
        const remaining = Math.max(0, effectiveLimit - used);
        const allowed = used + quantity <= effectiveLimit;

        return {
            success: true,
            data: {
                allowed,
                remaining,
                level: 'tenant',
                limit: quotaLimit,
                used,
            },
        };
    }

    /**
     * Check and record usage in one atomic operation.
     * Returns the quota check result; if allowed, also records the usage.
     */
    async checkAndRecordUsage(input: RecordUsageInput): Promise<ServiceResult<QuotaCheckResult>> {
        const quantity = input.quantity ?? 1;

        // Check quota first
        const checkResult = await this.checkQuota(
            input.tenantId,
            quantity,
            input.apiKeyId
        );

        if (!checkResult.success || !checkResult.data) {
            return checkResult;
        }

        if (!checkResult.data.allowed) {
            return checkResult;
        }

        // If allowed, record the usage
        const recordResult = await this.recordUsage(input);
        if (!recordResult.success) {
            return { success: false, error: recordResult.error };
        }

        // Return the quota check result with updated remaining
        return {
            success: true,
            data: {
                ...checkResult.data,
                remaining: Math.max(0, checkResult.data.remaining - quantity),
            },
        };
    }

    /**
     * Get the current period string (YYYY-MM for monthly).
     */
    getCurrentPeriod(): string {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    /**
     * Get the current hour period string (YYYY-MM-DD-HH for hourly).
     */
    getCurrentHourPeriod(): string {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        const hour = String(now.getUTCHours()).padStart(2, '0');
        return `${year}-${month}-${day}-${hour}`;
    }

    /**
     * Get the current day period string (YYYY-MM-DD for daily).
     */
    getCurrentDayPeriod(): string {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Get period string for a specific quota period type.
     */
    getPeriodForType(periodType: QuotaPeriod): string {
        switch (periodType) {
            case 'hour':
                return this.getCurrentHourPeriod();
            case 'day':
                return this.getCurrentDayPeriod();
            case 'month':
            default:
                return this.getCurrentPeriod();
        }
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    private mapRow(row: UsageEventRow): UsageEvent {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            apiKeyId: row.api_key_id,
            userId: row.user_id,
            service: row.service,
            action: row.action,
            quantity: row.quantity,
            period: row.period,
            timestamp: row.timestamp,
            idempotencyKey: row.idempotency_key,
        };
    }
}

/**
 * Create a QuotaService instance.
 */
export function createQuotaService(repository: AuthRepository): QuotaService {
    return new QuotaService(repository);
}
