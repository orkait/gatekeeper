// Webhook event types.
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

export type WebhookEventStatus = 'pending' | 'delivered' | 'failed';

export interface WebhookEvent {
    id: string;
    endpointId: string;
    eventType: string;
    payload: Record<string, unknown>;
    status: WebhookEventStatus;
    attempts: number;
    deliveredAt: number | null;
    lastAttemptAt: number | null;
    createdAt: number;
}

export interface EmitEventInput {
    tenantId: string;
    eventType: string;
    payload: Record<string, unknown>;
}

export interface RegisterWebhookInput {
    tenantId: string;
    url: string;
    events: string[];
    secret?: string;
}

export interface UpdateWebhookInput {
    url?: string;
    events?: string[];
    secret?: string;
    active?: boolean;
}
