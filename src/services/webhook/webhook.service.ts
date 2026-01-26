import type { AuthRepository } from '../../repositories';
import type { ServiceResult } from '../../types';
import { generateId, ok, err, nowMs } from '../shared';
import { 
    WebhookEventType, 
    type EmitEventInput, 
    type RegisterWebhookInput, 
    type UpdateWebhookInput, 
    type WebhookEndpoint, 
    type WebhookEvent, 
    type WebhookEventStatus 
} from './types';

const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

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

interface WebhookEventRow {
    [key: string]: unknown;
    id: string;
    endpoint_id: string;
    event_type: string;
    payload: string;
    status: string;
    attempts: number;
    delivered_at: number | null;
    last_attempt_at: number | null;
    created_at: number;
}

// WebhookService - Webhook endpoint management.
// Manages webhook endpoint registration for tenants.
// Validates URLs and manages event subscriptions.
export class WebhookService {
    constructor(private repository: AuthRepository) {}

    // ========================================================================
    // Webhook Registration
    // ========================================================================

    async registerWebhook(input: RegisterWebhookInput): Promise<ServiceResult<WebhookEndpoint>> {
        // Validate URL format
        if (!this.isValidUrl(input.url)) {
            return err('Invalid URL format. Must be a valid HTTP(S) URL.');
        }

        // Validate events
        if (!input.events || input.events.length === 0) {
            return err('At least one event type is required.');
        }

        const invalidEvents = input.events.filter(e => !this.isValidEventType(e));
        if (invalidEvents.length > 0) {
            return err(`Invalid event types: ${invalidEvents.join(', ')}`);
        }

        const now = nowMs();
        const webhook: WebhookEndpoint = {
            id: generateId('wh'),
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

        return ok(webhook);
    }

    async getWebhook(id: string): Promise<ServiceResult<WebhookEndpoint>> {
        const row = await this.repository.rawFirst<WebhookEndpointRow>(
            'SELECT * FROM webhook_endpoints WHERE id = ?',
            [id]
        );

        if (!row) {
            return err('Webhook not found');
        }

        return ok(this.mapRow(row));
    }

    async listWebhooks(tenantId: string): Promise<ServiceResult<WebhookEndpoint[]>> {
        const result = await this.repository.rawAll<WebhookEndpointRow>(
            'SELECT * FROM webhook_endpoints WHERE tenant_id = ? ORDER BY created_at DESC',
            [tenantId]
        );

        const webhooks = result.results.map(this.mapRow);
        return ok(webhooks);
    }

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

        return ok(webhooks);
    }

    async updateWebhook(id: string, input: UpdateWebhookInput): Promise<ServiceResult<WebhookEndpoint>> {
        const existing = await this.getWebhook(id);
        if (!existing.success || !existing.data) {
            return err('Webhook not found');
        }

        // Validate URL if provided
        if (input.url && !this.isValidUrl(input.url)) {
            return err('Invalid URL format. Must be a valid HTTP(S) URL.');
        }

        // Validate events if provided
        if (input.events) {
            if (input.events.length === 0) {
                return err('At least one event type is required.');
            }
            const invalidEvents = input.events.filter(e => !this.isValidEventType(e));
            if (invalidEvents.length > 0) {
                return err(`Invalid event types: ${invalidEvents.join(', ')}`);
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
            values.push(nowMs());
            values.push(id);

            await this.repository.rawRun(
                `UPDATE webhook_endpoints SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        }

        return this.getWebhook(id);
    }

    async deleteWebhook(id: string): Promise<ServiceResult<void>> {
        const existing = await this.getWebhook(id);
        if (!existing.success || !existing.data) {
            return err('Webhook not found');
        }

        await this.repository.rawRun(
            'DELETE FROM webhook_endpoints WHERE id = ?',
            [id]
        );

        return ok(undefined);
    }

    async activateWebhook(id: string): Promise<ServiceResult<WebhookEndpoint>> {
        return this.updateWebhook(id, { active: true });
    }

    async deactivateWebhook(id: string): Promise<ServiceResult<WebhookEndpoint>> {
        return this.updateWebhook(id, { active: false });
    }

    async deleteAllWebhooks(tenantId: string): Promise<ServiceResult<number>> {
        const result = await this.repository.rawRun(
            'DELETE FROM webhook_endpoints WHERE tenant_id = ?',
            [tenantId]
        );

        return ok(result.changes ?? 0);
    }

    // ========================================================================
    // Event Emission
    // ========================================================================

    async emitEvent(input: EmitEventInput): Promise<ServiceResult<WebhookEvent[]>> {
        // Get all active webhooks subscribed to this event
        const webhooksResult = await this.getWebhooksForEvent(input.tenantId, input.eventType);
        if (!webhooksResult.success || !webhooksResult.data) {
            return err(webhooksResult.error as string);
        }

        const webhooks = webhooksResult.data;
        if (webhooks.length === 0) {
            // No subscribers, return empty array
            return ok([]);
        }

        const now = nowMs();
        const events: WebhookEvent[] = [];

        // Create a webhook event for each subscribed endpoint
        for (const webhook of webhooks) {
            const event: WebhookEvent = {
                id: generateId('we'),
                endpointId: webhook.id,
                eventType: input.eventType,
                payload: input.payload,
                status: 'pending',
                attempts: 0,
                deliveredAt: null,
                lastAttemptAt: null,
                createdAt: now,
            };

            await this.repository.rawRun(
                `INSERT INTO webhook_events (id, endpoint_id, event_type, payload, status, attempts, delivered_at, last_attempt_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    event.id,
                    event.endpointId,
                    event.eventType,
                    JSON.stringify(event.payload),
                    event.status,
                    event.attempts,
                    event.deliveredAt,
                    event.lastAttemptAt,
                    event.createdAt,
                ]
            );

            events.push(event);
        }

        return ok(events);
    }

    async getWebhookEvent(id: string): Promise<ServiceResult<WebhookEvent>> {
        const row = await this.repository.rawFirst<WebhookEventRow>(
            'SELECT * FROM webhook_events WHERE id = ?',
            [id]
        );

        if (!row) {
            return err('Webhook event not found');
        }

        return ok(this.mapEventRow(row));
    }

    async getPendingEvents(limit: number = 100): Promise<ServiceResult<WebhookEvent[]>> {
        const result = await this.repository.rawAll<WebhookEventRow>(
            `SELECT * FROM webhook_events 
             WHERE status = 'pending' 
             ORDER BY created_at ASC 
             LIMIT ?`,
            [limit]
        );

        const events = result.results.map(row => this.mapEventRow(row));
        return ok(events);
    }

    async getEventsForEndpoint(
        endpointId: string,
        options?: { status?: WebhookEventStatus; limit?: number }
    ): Promise<ServiceResult<WebhookEvent[]>> {
        const conditions = ['endpoint_id = ?'];
        const params: unknown[] = [endpointId];

        if (options?.status) {
            conditions.push('status = ?');
            params.push(options.status);
        }

        const limit = options?.limit ?? 100;
        params.push(limit);

        const result = await this.repository.rawAll<WebhookEventRow>(
            `SELECT * FROM webhook_events 
             WHERE ${conditions.join(' AND ')}
             ORDER BY created_at DESC 
             LIMIT ?`,
            params
        );

        const events = result.results.map(row => this.mapEventRow(row));
        return ok(events);
    }

    async updateEventStatus(
        id: string,
        status: WebhookEventStatus,
        incrementAttempts: boolean = true
    ): Promise<ServiceResult<WebhookEvent>> {
        const existing = await this.getWebhookEvent(id);
        if (!existing.success || !existing.data) {
            return err('Webhook event not found');
        }

        const now = nowMs();
        const updates: string[] = ['status = ?', 'last_attempt_at = ?'];
        const values: unknown[] = [status, now];

        if (incrementAttempts) {
            updates.push('attempts = attempts + 1');
        }

        if (status === 'delivered') {
            updates.push('delivered_at = ?');
            values.push(now);
        }

        values.push(id);

        await this.repository.rawRun(
            `UPDATE webhook_events SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        return this.getWebhookEvent(id);
    }

    async markEventDelivered(id: string): Promise<ServiceResult<WebhookEvent>> {
        return this.updateEventStatus(id, 'delivered', true);
    }

    async markEventFailed(id: string): Promise<ServiceResult<WebhookEvent>> {
        return this.updateEventStatus(id, 'failed', true);
    }

    async retryEvent(id: string): Promise<ServiceResult<WebhookEvent>> {
        return this.updateEventStatus(id, 'pending', false);
    }

    // ========================================================================
    // Validation Helpers
    // ========================================================================

    private isValidUrl(url: string): boolean {
        return URL_REGEX.test(url);
    }

    private isValidEventType(eventType: string): boolean {
        // Allow wildcard
        if (eventType === '*') return true;
        
        // Check against known event types
        return Object.values(WebhookEventType).includes(eventType as WebhookEventType);
    }

    getValidEventTypes(): string[] {
        return Object.values(WebhookEventType);
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

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

    private mapEventRow(row: WebhookEventRow): WebhookEvent {
        return {
            id: row.id,
            endpointId: row.endpoint_id,
            eventType: row.event_type,
            payload: JSON.parse(row.payload || '{}'),
            status: row.status as WebhookEventStatus,
            attempts: row.attempts,
            deliveredAt: row.delivered_at,
            lastAttemptAt: row.last_attempt_at,
            createdAt: row.created_at,
        };
    }
}

// Create a WebhookService instance.
export function createWebhookService(repository: AuthRepository): WebhookService {
    return new WebhookService(repository);
}
