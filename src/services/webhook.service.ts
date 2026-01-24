import type { AuthRepository } from '../repositories/auth.repository';
import type { ServiceResult } from '../types';

/**
 * Webhook event types.
 */
export const WebhookEventType = {
    SUBSCRIPTION_UPGRADED: 'subscription.upgraded',
    SUBSCRIPTION_DOWNGRADED: 'subscription.downgraded',
    SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
    USER_ADDED_TO_TENANT: 'user.added_to_tenant',
    USER_REMOVED_FROM_TENANT: 'user.removed_from_tenant',
    API_KEY_CREATED: 'api_key.created',
    API_KEY_REVOKED: 'api_key.revoked',
    QUOTA_EXCEEDED: 'quota.exceeded',
    QUOTA_WARNING: 'quota.warning',
} as const;

export type WebhookEventType = typeof WebhookEventType[keyof typeof WebhookEventType];

/**
 * Webhook endpoint record.
 */
export interface WebhookEndpoint {
    id: string;
    tenantId: string;
    url: string;
    events: string[];
    secret: string | null;
    active: boolean;
    createdAt: number;
    updatedAt: number;
}

/**
 * Input for registering a webhook.
 */
export interface RegisterWebhookInput {
    tenantId: string;
    url: string;
    events: string[];
    secret?: string;
}

/**
 * Input for updating a webhook.
 */
export interface UpdateWebhookInput {
    url?: string;
    events?: string[];
    secret?: string;
    active?: boolean;
}

/**
 * Database row for webhook_endpoints table.
 */
interface WebhookEndpointRow {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    url: string;
    events: string;
    secret: string | null;
    active: number;
    created_at: number;
    updated_at: number;
}

/**
 * URL validation regex.
 */
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * WebhookService - Webhook endpoint management.
 *
 * Manages webhook endpoint registration for tenants.
 * Validates URLs and manages event subscriptions.
 */
export class WebhookService {
    constructor(private repository: AuthRepository) {}

    // ========================================================================
    // Webhook Registration
    // ========================================================================

    /**
     * Register a new webhook endpoint for a tenant.
     */
    async registerWebhook(input: RegisterWebhookInput): Promise<ServiceResult<WebhookEndpoint>> {
        // Validate URL format
        if (!this.isValidUrl(input.url)) {
            return { success: false, error: 'Invalid URL format. Must be a valid HTTP(S) URL.' };
        }

        // Validate events
        if (!input.events || input.events.length === 0) {
            return { success: false, error: 'At least one event type is required.' };
        }

        const invalidEvents = input.events.filter(e => !this.isValidEventType(e));
        if (invalidEvents.length > 0) {
            return { success: false, error: `Invalid event types: ${invalidEvents.join(', ')}` };
        }

        const now = Date.now();
        const webhook: WebhookEndpoint = {
            id: this.generateId('wh'),
            tenantId: input.tenantId,
            url: input.url,
            events: input.events,
            secret: input.secret || null,
            active: true,
            createdAt: now,
            updatedAt: now,
        };

        await this.repository.rawRun(
            `INSERT INTO webhook_endpoints (id, tenant_id, url, events, secret, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                webhook.id,
                webhook.tenantId,
                webhook.url,
                JSON.stringify(webhook.events),
                webhook.secret,
                webhook.active ? 1 : 0,
                webhook.createdAt,
                webhook.updatedAt,
            ]
        );

        return { success: true, data: webhook };
    }

    /**
     * Get a webhook endpoint by ID.
     */
    async getWebhook(id: string): Promise<ServiceResult<WebhookEndpoint>> {
        const row = await this.repository.rawFirst<WebhookEndpointRow>(
            'SELECT * FROM webhook_endpoints WHERE id = ?',
            [id]
        );

        if (!row) {
            return { success: false, error: 'Webhook not found' };
        }

        return { success: true, data: this.mapRow(row) };
    }

    /**
     * List all webhooks for a tenant.
     */
    async listWebhooks(tenantId: string): Promise<ServiceResult<WebhookEndpoint[]>> {
        const result = await this.repository.rawAll<WebhookEndpointRow>(
            'SELECT * FROM webhook_endpoints WHERE tenant_id = ? ORDER BY created_at DESC',
            [tenantId]
        );

        const webhooks = result.results.map(this.mapRow);
        return { success: true, data: webhooks };
    }

    /**
     * List active webhooks for a tenant subscribed to a specific event.
     */
    async getWebhooksForEvent(tenantId: string, eventType: string): Promise<ServiceResult<WebhookEndpoint[]>> {
        // Get all active webhooks for the tenant
        const result = await this.repository.rawAll<WebhookEndpointRow>(
            'SELECT * FROM webhook_endpoints WHERE tenant_id = ? AND active = 1',
            [tenantId]
        );

        // Filter by event type (events is stored as JSON array)
        const webhooks = result.results
            .map(this.mapRow)
            .filter(wh => wh.events.includes(eventType) || wh.events.includes('*'));

        return { success: true, data: webhooks };
    }

    /**
     * Update a webhook endpoint.
     */
    async updateWebhook(id: string, input: UpdateWebhookInput): Promise<ServiceResult<WebhookEndpoint>> {
        const existing = await this.getWebhook(id);
        if (!existing.success || !existing.data) {
            return { success: false, error: 'Webhook not found' };
        }

        // Validate URL if provided
        if (input.url && !this.isValidUrl(input.url)) {
            return { success: false, error: 'Invalid URL format. Must be a valid HTTP(S) URL.' };
        }

        // Validate events if provided
        if (input.events) {
            if (input.events.length === 0) {
                return { success: false, error: 'At least one event type is required.' };
            }
            const invalidEvents = input.events.filter(e => !this.isValidEventType(e));
            if (invalidEvents.length > 0) {
                return { success: false, error: `Invalid event types: ${invalidEvents.join(', ')}` };
            }
        }

        const fields: string[] = [];
        const values: unknown[] = [];

        if (input.url !== undefined) {
            fields.push('url = ?');
            values.push(input.url);
        }
        if (input.events !== undefined) {
            fields.push('events = ?');
            values.push(JSON.stringify(input.events));
        }
        if (input.secret !== undefined) {
            fields.push('secret = ?');
            values.push(input.secret);
        }
        if (input.active !== undefined) {
            fields.push('active = ?');
            values.push(input.active ? 1 : 0);
        }

        if (fields.length > 0) {
            fields.push('updated_at = ?');
            values.push(Date.now());
            values.push(id);

            await this.repository.rawRun(
                `UPDATE webhook_endpoints SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        }

        return this.getWebhook(id);
    }

    /**
     * Delete a webhook endpoint.
     */
    async deleteWebhook(id: string): Promise<ServiceResult<void>> {
        const existing = await this.getWebhook(id);
        if (!existing.success || !existing.data) {
            return { success: false, error: 'Webhook not found' };
        }

        await this.repository.rawRun(
            'DELETE FROM webhook_endpoints WHERE id = ?',
            [id]
        );

        return { success: true };
    }

    /**
     * Activate a webhook endpoint.
     */
    async activateWebhook(id: string): Promise<ServiceResult<WebhookEndpoint>> {
        return this.updateWebhook(id, { active: true });
    }

    /**
     * Deactivate a webhook endpoint.
     */
    async deactivateWebhook(id: string): Promise<ServiceResult<WebhookEndpoint>> {
        return this.updateWebhook(id, { active: false });
    }

    /**
     * Delete all webhooks for a tenant.
     */
    async deleteAllWebhooks(tenantId: string): Promise<ServiceResult<number>> {
        const result = await this.repository.rawRun(
            'DELETE FROM webhook_endpoints WHERE tenant_id = ?',
            [tenantId]
        );

        return { success: true, data: result.changes ?? 0 };
    }

    // ========================================================================
    // Validation Helpers
    // ========================================================================

    /**
     * Validate URL format.
     */
    private isValidUrl(url: string): boolean {
        return URL_REGEX.test(url);
    }

    /**
     * Check if event type is valid.
     */
    private isValidEventType(eventType: string): boolean {
        // Allow wildcard
        if (eventType === '*') return true;
        
        // Check against known event types
        return Object.values(WebhookEventType).includes(eventType as WebhookEventType);
    }

    /**
     * Get all valid event types.
     */
    getValidEventTypes(): string[] {
        return Object.values(WebhookEventType);
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    private mapRow(row: WebhookEndpointRow): WebhookEndpoint {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            url: row.url,
            events: JSON.parse(row.events || '[]'),
            secret: row.secret,
            active: row.active === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

/**
 * Create a WebhookService instance.
 */
export function createWebhookService(repository: AuthRepository): WebhookService {
    return new WebhookService(repository);
}
