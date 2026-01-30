import type { Row } from "../utils/db";

/**
* Shared database row types (snake_case to match D1 schema).
* These are the common row types used across adapters and repositories.
*/

export interface UserRow {
    [key: string]: unknown;
    id: string;
    email: string;
    password_hash: string | null;
    email_verified: number;
    google_id: string | null;
    name: string | null;
    avatar_url: string | null;
    status: string;
    created_at: number;
    updated_at: number;
    last_login_at: number | null;
    locked_until: number | null;
    failed_login_count: number;
}

export interface RefreshTokenRow {
    [key: string]: unknown;
    id: string;
    user_id: string;
    token_hash: string;
    device_info: string | null;
    ip_address: string | null;
    expires_at: number;
    created_at: number;
    revoked_at: number | null;
}

export interface EmailVerificationTokenRow {
    [key: string]: unknown;
    id: string;
    user_id: string;
    token: string;
    token_hash: string;
    expires_at: number;
    created_at: number;
    verified_at: number | null;
}

export interface TenantRow {
    [key: string]: unknown;
    id: string;
    name: string;
    global_quota_limit: number | null;
    created_at: number;
    updated_at: number;
}

export interface TenantUserRow {
    [key: string]: unknown;
    tenant_id: string;
    user_id: string;
    role: string;
    created_at: number;
}

export interface SessionRow extends Row {
    [key: string]: unknown;
    id: string;
    user_id: string;
    tenant_id: string | null;
    service: string;
    refresh_token_hash: string | null;
    device_info: string | null;
    ip_address: string | null;
    expires_at: number;
    created_at: number;
    updated_at: number;
    revoked_at: number | null;
}

export interface ProductRow {
    [key: string]: unknown;
    id: string;
    name: string;
    slug: string;
    description: string | null;
    status: string;
    created_at: number;
    updated_at: number;
}

export interface TierRow {
    [key: string]: unknown;
    id: string;
    product_id: string;
    name: string;
    slug: string;
    api_calls_limit: number;
    resource_limit: number;
    rate_limit_rpm: number;
    features: string | null;
    status: string;
    created_at: number;
}

export interface SubscriptionRow {
    [key: string]: unknown;
    id: string;
    user_id: string;
    product_id: string;
    tier_id: string;
    status: string;
    current_period_start: number;
    current_period_end: number;
    external_subscription_id: string | null;
    created_at: number;
    updated_at: number;
    cancelled_at: number | null;
}

export interface ApiKeyRow {
    [key: string]: unknown;
    id: string;
    subscription_id: string;
    user_id: string;
    key_hash: string;
    key_prefix: string;
    name: string | null;
    status: string;
    allowed_ips: string | null;
    allowed_origins: string | null;
    last_used_at: number | null;
    created_at: number;
    revoked_at: number | null;
}

export interface UsageRow {
    [key: string]: unknown;
    id: string;
    subscription_id: string;
    api_key_id: string | null;
    period_start: number;
    period_end: number;
    api_calls: number;
    resource_count: number;
    current_window_start: number | null;
    current_window_count: number;
    created_at: number;
    updated_at: number;
}

export interface WebhookConfigRow {
    [key: string]: unknown;
    id: string;
    user_id: string;
    url: string;
    secret: string;
    events: string;
    status: string;
    last_success_at: number | null;
    last_failure_at: number | null;
    consecutive_failures: number;
    created_at: number;
    updated_at: number;
}

export interface WebhookDeliveryRow {
    [key: string]: unknown;
    id: string;
    webhook_config_id: string;
    event_type: string;
    event_id: string;
    payload: string;
    status: string;
    attempts: number;
    response_status: number | null;
    response_body: string | null;
    created_at: number;
    delivered_at: number | null;
}

// Joined row types for complex queries
export interface SubscriptionWithTierRow extends SubscriptionRow {
    [key: string]: unknown;
    tier_id_full: string;
    tier_product_id: string;
    tier_name: string;
    tier_slug: string;
    api_calls_limit: number;
    resource_limit: number;
    rate_limit_rpm: number;
    features: string | null;
    tier_status: string;
    tier_created_at: number;
    prod_id: string;
    prod_name: string;
    prod_slug: string;
    prod_description: string | null;
    prod_status: string;
    prod_created_at: number;
    prod_updated_at: number;
}

export interface ApiKeyWithSubscriptionRow extends ApiKeyRow {
    [key: string]: unknown;
    sub_id: string;
    sub_user_id: string;
    sub_product_id: string;
    sub_tier_id: string;
    sub_status: string;
    current_period_start: number;
    current_period_end: number;
    external_subscription_id: string | null;
    sub_created_at: number;
    sub_updated_at: number;
    cancelled_at: number | null;
    tier_id_full: string;
    tier_product_id: string;
    tier_name: string;
    tier_slug: string;
    api_calls_limit: number;
    resource_limit: number;
    rate_limit_rpm: number;
    features: string | null;
    tier_status: string;
    tier_created_at: number;
    prod_id: string;
    prod_name: string;
    prod_slug: string;
    prod_description: string | null;
    prod_status: string;
    prod_created_at: number;
    prod_updated_at: number;
}
