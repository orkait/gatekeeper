// Re-export shared row types
export type {
    UserRow,
    RefreshTokenRow,
    EmailVerificationTokenRow,
    TenantRow,
    TenantUserRow,
    SessionRow,
} from '../db/row-types';

// ============================================================================
// Domain Types (specific to auth repository)
// ============================================================================

export type TenantRole = 'owner' | 'admin' | 'member';

export interface Tenant {
    id: string;
    name: string;
    globalQuotaLimit: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface TenantUser {
    tenantId: string;
    userId: string;
    role: TenantRole;
    createdAt: number;
}

export interface Session {
    id: string;
    userId: string;
    tenantId: string | null;
    service: string;
    refreshTokenHash: string | null;
    deviceInfo: string | null;
    ipAddress: string | null;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
    revokedAt: number | null;
}

// ============================================================================
// Batch Operation Types
// ============================================================================

export interface BatchStatement {
    sql: string;
    params?: unknown[];
}
