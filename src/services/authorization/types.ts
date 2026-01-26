import type { TenantRole } from '../../repositories';
import type { SubscriptionTier } from '../subscription';
import type { ParsedOverrides } from '../override';
import type { QuotaCheckResult } from '../quota';

export interface AuthorizeContext {
    /** User ID (from session JWT sub) */
    userId: string;
    /** Tenant ID */
    tenantId: string;
    /** Session ID */
    sessionId?: string;
    /** Service being accessed */
    service: string;
    /** Action being performed */
    action: string;
    /** Resource being accessed (optional) */
    resource?: string;
    /** API Key ID if using API key auth */
    apiKeyId?: string;
    /** Required feature flag (optional) */
    requiredFeature?: string;
    /** Required role (optional) */
    requiredRole?: TenantRole;
    /** Quantity for quota check (default: 1) */
    quantity?: number;
}

export interface AuthorizeResult {
    allowed: boolean;
    reason: string;
    metadata: AuthorizeMetadata;
}

export interface AuthorizeMetadata {
    /** User's role in the tenant */
    role?: TenantRole;
    /** Subscription tier (possibly upgraded via override) */
    tier?: SubscriptionTier;
    /** Whether result came from cache */
    degraded?: boolean;
    /** Quota information if checked */
    quota?: QuotaCheckResult;
    /** Active overrides if any */
    overrides?: ParsedOverrides;
    /** Which checks passed */
    checks: AuthorizeChecks;
}

export interface AuthorizeChecks {
    session: boolean;
    subscription: boolean;
    serviceEnabled: boolean;
    feature: boolean;
    quota: boolean;
    rbac: boolean;
    override: boolean;
}

export const DenyReason = {
    SESSION_INVALID: 'Session is invalid or expired',
    SESSION_REVOKED: 'Session has been revoked',
    USER_NOT_IN_TENANT: 'User is not a member of this tenant',
    SUBSCRIPTION_INACTIVE: 'Subscription is not active',
    SUBSCRIPTION_NOT_FOUND: 'No subscription found for tenant',
    SERVICE_DISABLED: 'Service is not enabled for this subscription',
    FEATURE_DISABLED: 'Required feature is not enabled',
    QUOTA_EXCEEDED: 'Quota limit exceeded',
    INSUFFICIENT_ROLE: 'Insufficient role permissions',
    INTERNAL_ERROR: 'Internal authorization error',
} as const;
