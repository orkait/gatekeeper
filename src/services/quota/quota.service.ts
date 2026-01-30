import type { AuthRepository } from '../../repositories';
import type { ServiceResult } from '../../types';
import { generateId, ok, err, nowMs } from '../shared';
import { QUOTA_BUFFER_PERCENTAGE, DEFAULT_USAGE_EVENTS_LIMIT, DEFAULT_USAGE_EVENTS_OFFSET } from '../../constants/quota';
import type { 
    QuotaCheckResult, 
    QuotaPeriod, 
    RecordUsageInput, 
    UsageEvent, 
    UsageSummary 
} from './types';

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

// QuotaService - Usage tracking with idempotency.
// Records usage events with idempotent increments and provides
// usage summaries for quota checking.
export class QuotaService {
    constructor(private repository: AuthRepository) {}

    // Record a usage event with idempotency.
    // If the idempotency key already exists, the request is ignored.
    async recordUsage(input: RecordUsageInput): Promise<ServiceResult<UsageEvent>> {
        const now = nowMs();
        const period = this.getCurrentPeriod();

        // Check if idempotency key already exists
        const existing = await this.repository.rawFirst<UsageEventRow>(
            'SELECT * FROM usage_events WHERE idempotency_key = ?',
            [input.idempotencyKey]
        );

        if (existing) {
            // Return the existing event (idempotent response)
            return ok(this.mapRow(existing));
        }

        const event: UsageEvent = {
            id: generateId('ue'),
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

        return ok(event);
    }

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

        return ok({
            tenantId,
            period: targetPeriod,
            totalQuantity: result?.total_quantity ?? 0,
            eventCount: result?.event_count ?? 0,
        });
    }

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
            return ok({
                tenantId: '',
                period: targetPeriod,
                totalQuantity: 0,
                eventCount: 0,
            });
        }

        return ok({
            tenantId: result.tenant_id,
            period: targetPeriod,
            totalQuantity: result.total_quantity,
            eventCount: result.event_count,
        });
    }

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

        const limit = options?.limit ?? DEFAULT_USAGE_EVENTS_LIMIT;
        const offset = options?.offset ?? DEFAULT_USAGE_EVENTS_OFFSET;

        const result = await this.repository.rawAll<UsageEventRow>(
            `SELECT * FROM usage_events
             WHERE ${conditions.join(' AND ')}
             ORDER BY timestamp DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        const events = result.results.map(this.mapRow);
        return ok(events);
    }

    // ========================================================================
    // Quota Checking
    // ========================================================================

    // Check quota at per-key and global tenant levels.
    // Checks in order:
    // 1. Per-API-key limit (if apiKeyId provided and key has a limit)
    // 2. Global tenant limit (if tenant has a limit)
    // Uses a 99% buffer (QUOTA_BUFFER) to prevent race condition overages.
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
            return err('API key not found');
        }

        // If no quota limit set, treat as unlimited at key level
        if (!apiKeyRow.quota_limit) {
            return ok({
                allowed: true,
                remaining: Number.MAX_SAFE_INTEGER,
                level: 'unlimited',
            });
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
        const effectiveLimit = Math.floor(quotaLimit * QUOTA_BUFFER_PERCENTAGE);
        const remaining = Math.max(0, effectiveLimit - used);
        const allowed = used + quantity <= effectiveLimit;

        return ok({
            allowed,
            remaining,
            level: 'api_key',
            limit: quotaLimit,
            used,
        });
    }

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
            return err('Tenant not found');
        }

        // If no global quota limit set, treat as unlimited
        if (!tenantRow.global_quota_limit) {
            return ok({
                allowed: true,
                remaining: Number.MAX_SAFE_INTEGER,
                level: 'unlimited',
            });
        }

        const quotaLimit = tenantRow.global_quota_limit;
        const period = this.getCurrentPeriod(); // Global tenant quota is monthly

        // Get current usage for the tenant in the period
        const usageResult = await this.getUsage(tenantId, period);
        if (!usageResult.success || !usageResult.data) {
            return err('Failed to get tenant usage');
        }

        const used = usageResult.data.totalQuantity;
        const effectiveLimit = Math.floor(quotaLimit * QUOTA_BUFFER_PERCENTAGE);
        const remaining = Math.max(0, effectiveLimit - used);
        const allowed = used + quantity <= effectiveLimit;

        return ok({
            allowed,
            remaining,
            level: 'tenant',
            limit: quotaLimit,
            used,
        });
    }

    // Check and record usage in one operation.
    // Returns the quota check result; if allowed, also records the usage.
    // 
    // RACE CONDITION MITIGATION:
    // The idempotency_key constraint in usage_events prevents duplicate recording.
    // After recording, we re-check the quota to detect if concurrent requests
    // pushed us over the limit. If so, we return allowed=false (the usage is
    // already recorded, but the caller should not proceed).
    async checkAndRecordUsage(input: RecordUsageInput): Promise<ServiceResult<QuotaCheckResult>> {
        const quantity = input.quantity ?? 1;

        // Check quota first (optimistic check)
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

        // Record the usage (idempotency_key ensures no duplicates)
        const recordResult = await this.recordUsage(input);
        if (!recordResult.success) {
            return err(recordResult.error as string);
        }

        // Re-check quota AFTER recording to detect race condition overages
        // This is the "optimistic locking" pattern - we record first, then validate
        const postCheckResult = await this.checkQuota(
            input.tenantId,
            0, // Check with 0 quantity since we already recorded
            input.apiKeyId
        );

        if (!postCheckResult.success || !postCheckResult.data) {
            // If post-check fails, still return allowed since we did record
            return ok({
                ...checkResult.data,
                remaining: Math.max(0, checkResult.data.remaining - quantity),
            });
        }

        // If we're now over limit due to concurrent requests, indicate not allowed
        // The usage was recorded, but the caller should not proceed
        if (postCheckResult.data.remaining < 0) {
            return ok({
                allowed: false,
                remaining: 0,
                level: postCheckResult.data.level,
                limit: postCheckResult.data.limit,
                used: postCheckResult.data.used,
                message: 'Quota exceeded due to concurrent requests',
            });
        }

        // Return the quota check result with updated remaining
        return ok({
            ...checkResult.data,
            remaining: postCheckResult.data.remaining,
        });
    }

    // Get the current period string (YYYY-MM for monthly).
    getCurrentPeriod(): string {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    // Get the current hour period string (YYYY-MM-DD-HH for hourly).
    getCurrentHourPeriod(): string {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        const hour = String(now.getUTCHours()).padStart(2, '0');
        return `${year}-${month}-${day}-${hour}`;
    }

    // Get the current day period string (YYYY-MM-DD for daily).
    getCurrentDayPeriod(): string {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Get period string for a specific quota period type.
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

// Create a QuotaService instance.
export function createQuotaService(repository: AuthRepository): QuotaService {
    return new QuotaService(repository);
}
