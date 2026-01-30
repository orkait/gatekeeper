export { mapUser, mapRefreshToken, mapEmailVerificationToken } from '../db/mappers';

import type {
    TenantRow, TenantUserRow, SessionRow,
    Tenant, TenantUser, TenantRole, Session,
} from './types';

export function mapTenant(row: TenantRow): Tenant {
    return {
        id: row.id,
        name: row.name,
        globalQuotaLimit: row.global_quota_limit,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function mapTenantUser(row: TenantUserRow): TenantUser {
    return {
        tenantId: row.tenant_id,
        userId: row.user_id,
        role: row.role as TenantRole,
        createdAt: row.created_at,
    };
}

export function mapSession(row: SessionRow): Session {
    return {
        id: row.id,
        userId: row.user_id,
        tenantId: row.tenant_id,
        service: row.service,
        refreshTokenHash: row.refresh_token_hash,
        deviceInfo: row.device_info,
        ipAddress: row.ip_address,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        revokedAt: row.revoked_at,
    };
}
