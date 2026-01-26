export type QuotaPeriod = 'hour' | 'day' | 'month';

export type QuotaLevel = 'api_key' | 'tenant' | 'unlimited';

export interface QuotaCheckResult {
    allowed: boolean;
    remaining: number;
    level: QuotaLevel;
    limit?: number;
    used?: number;
}

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

export interface RecordUsageInput {
    tenantId: string;
    apiKeyId?: string;
    userId?: string;
    service: string;
    action: string;
    quantity?: number;
    idempotencyKey: string;
}

export interface UsageSummary {
    tenantId: string;
    period: string;
    totalQuantity: number;
    eventCount: number;
}
