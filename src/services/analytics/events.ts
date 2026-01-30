import { captureEvent } from './analytics.service';

export const ControlPlaneEvents = {
    SUBSCRIPTION_UPGRADED: 'control_plane_subscription_upgraded',
    SUBSCRIPTION_CANCELLED: 'control_plane_subscription_cancelled',
    QUOTA_LIMIT_REACHED: 'control_plane_quota_limit_reached',
    ACCOUNT_LOCKED: 'control_plane_account_locked',
    UNAUTHORIZED_ACCESS: 'control_plane_unauthorized_access',
    SUBSCRIPTION_CREATED: 'control_plane_subscription_created',
    SUBSCRIPTION_DOWNGRADED: 'control_plane_subscription_downgraded',
    API_KEY_REVOKED: 'control_plane_api_key_revoked',
    TENANT_CREATED: 'control_plane_tenant_created',
    SERVICE_ENABLED: 'control_plane_service_enabled',
    ADMIN_OVERRIDE_APPLIED: 'control_plane_admin_override_applied',
    WEBHOOK_DELIVERY_FAILED: 'control_plane_webhook_delivery_failed',
} as const;

export interface SubscriptionUpgradedProps {
    from_plan: string;
    to_plan: string;
    mrr_change: number;
    user_id?: string;
}

export interface SubscriptionCancelledProps {
    plan: string;
    mrr_lost: number;
    reason?: string;
    user_id?: string;
}

export interface QuotaLimitReachedProps {
    quota_type: string;
    limit: number;
    current_usage: number;
    plan: string;
}

export interface AccountLockedProps {
    tenant_id: string;
    reason: 'failed_login_attempts' | 'admin_action' | 'security_violation';
    failed_attempts?: number;
}

export interface UnauthorizedAccessProps {
    tenant_id: string;
    resource: string;
    action: string;
    ip_address?: string;
}

export interface SubscriptionCreatedProps {
    plan: string;
    mrr: number;
    user_id?: string;
}

export interface SubscriptionDowngradedProps {
    from_plan: string;
    to_plan: string;
    mrr_change: number;
    user_id?: string;
}

export interface ApiKeyRevokedProps {
    api_key_id: string;
    revoked_by: string;
    reason?: string;
}

export interface TenantCreatedProps {
    name: string;
    user_id: string;
    plan?: string;
}

export interface ServiceEnabledProps {
    service_name: string;
    user_id: string;
}

export interface AdminOverrideAppliedProps {
    admin_id: string;
    override_type: string;
    reason?: string;
}

export interface WebhookDeliveryFailedProps {
    webhook_id: string;
    event_type: string;
    error: string;
    retry_count: number;
}

function createEventTracker<T extends Record<string, any>>(eventName: string) {
    return (distinctId: string, properties: T): Promise<void> => {
        return captureEvent(distinctId, eventName, properties);
    };
}


export const trackSubscriptionUpgraded = createEventTracker<SubscriptionUpgradedProps>(
    ControlPlaneEvents.SUBSCRIPTION_UPGRADED
);

export const trackSubscriptionCancelled = createEventTracker<SubscriptionCancelledProps>(
    ControlPlaneEvents.SUBSCRIPTION_CANCELLED
);

export const trackQuotaLimitReached = createEventTracker<QuotaLimitReachedProps>(
    ControlPlaneEvents.QUOTA_LIMIT_REACHED
);

export const trackAccountLocked = createEventTracker<AccountLockedProps>(
    ControlPlaneEvents.ACCOUNT_LOCKED
);

export const trackUnauthorizedAccess = createEventTracker<UnauthorizedAccessProps>(
    ControlPlaneEvents.UNAUTHORIZED_ACCESS
);

export const trackSubscriptionCreated = createEventTracker<SubscriptionCreatedProps>(
    ControlPlaneEvents.SUBSCRIPTION_CREATED
);

export const trackSubscriptionDowngraded = createEventTracker<SubscriptionDowngradedProps>(
    ControlPlaneEvents.SUBSCRIPTION_DOWNGRADED
);

export const trackApiKeyRevoked = createEventTracker<ApiKeyRevokedProps>(
    ControlPlaneEvents.API_KEY_REVOKED
);

export const trackTenantCreated = createEventTracker<TenantCreatedProps>(
    ControlPlaneEvents.TENANT_CREATED
);

export const trackServiceEnabled = createEventTracker<ServiceEnabledProps>(
    ControlPlaneEvents.SERVICE_ENABLED
);

export const trackAdminOverrideApplied = createEventTracker<AdminOverrideAppliedProps>(
    ControlPlaneEvents.ADMIN_OVERRIDE_APPLIED
);

export const trackWebhookDeliveryFailed = createEventTracker<WebhookDeliveryFailedProps>(
    ControlPlaneEvents.WEBHOOK_DELIVERY_FAILED
);
