/**
 * Shared mappers for common row types used across adapters and repositories.
 */

import type { User, UserStatus, RefreshToken, EmailVerificationToken } from '../types';
import type { UserRow, RefreshTokenRow, EmailVerificationTokenRow } from './row-types';

export function mapUser(row: UserRow): User {
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        emailVerified: row.email_verified === 1,
        googleId: row.google_id,
        name: row.name,
        avatarUrl: row.avatar_url,
        status: row.status as UserStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastLoginAt: row.last_login_at,
        lockedUntil: row.locked_until,
        failedLoginCount: row.failed_login_count,
    };
}

export function mapRefreshToken(row: RefreshTokenRow): RefreshToken {
    return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        deviceInfo: row.device_info,
        ipAddress: row.ip_address,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
    };
}

export function mapEmailVerificationToken(row: EmailVerificationTokenRow): EmailVerificationToken {
    return {
        id: row.id,
        userId: row.user_id,
        token: row.token,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        verifiedAt: row.verified_at,
    };
}
