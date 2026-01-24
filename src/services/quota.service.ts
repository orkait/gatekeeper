import type { AuthRepository } from '../repositories/auth.repository';
import type { ServiceResult } from '../types';

/**
 * Quota period types.
 */
export type QuotaPeriod = 'hour' | 'day' | 'month';

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
