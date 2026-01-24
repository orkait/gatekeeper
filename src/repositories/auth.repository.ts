/**
 * AuthRepository - Typed repository for auth-critical database operations.
 *
 * This repository uses explicit SQL queries with strong consistency for all
 * auth-path reads. It replaces the adapter abstraction with direct, typed
 * database access that is easier to audit and optimize.
 *
 * Usage:
 *   const repo = new AuthRepository(createAuthDB(env.DB));
 *   const user = await repo.getUserById(userId);
 */

import { createAuthDB, type AuthDB, type QueryResult, type D1Meta } from '../utils/db';
import type {
    User,
    UserStatus,
    RefreshToken,
} from '../types';

// ============================================================================
// Database Row Types (snake_case to match D1 schema)
// ============================================================================

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

export interface SessionRow {
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

// ============================================================================
// Domain Types
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

// ============================================================================
// AuthRepository
// ============================================================================

export class AuthRepository {
    private db: AuthDB;

    constructor(db: D1Database | AuthDB) {
        // Accept either raw D1Database or already-wrapped AuthDB
        this.db = 'raw' in db ? db : createAuthDB(db);
    }

    // ========================================================================
    // User Operations
    // ========================================================================

    async getUserById(id: string): Promise<User | null> {
        const row = await this.db.first<UserRow>(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );
        return row ? this.mapUser(row) : null;
    }

    async getUserByEmail(email: string): Promise<User | null> {
        const row = await this.db.first<UserRow>(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return row ? this.mapUser(row) : null;
    }

    async getUserByGoogleId(googleId: string): Promise<User | null> {
        const row = await this.db.first<UserRow>(
            'SELECT * FROM users WHERE google_id = ?',
            [googleId]
        );
        return row ? this.mapUser(row) : null;
    }

    async createUser(user: User): Promise<D1Meta> {
        return this.db.run(
            `INSERT INTO users (id, email, password_hash, email_verified, google_id, name, avatar_url, status, created_at, updated_at, last_login_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                user.id,
                user.email,
                user.passwordHash,
                user.emailVerified ? 1 : 0,
                user.googleId,
                user.name,
                user.avatarUrl,
                user.status,
                user.createdAt,
                user.updatedAt,
                user.lastLoginAt,
            ]
        );
    }

    async updateUser(id: string, updates: Partial<User>): Promise<D1Meta> {
        const fields: string[] = [];
        const values: unknown[] = [];

        if (updates.email !== undefined) {
            fields.push('email = ?');
            values.push(updates.email);
        }
        if (updates.passwordHash !== undefined) {
            fields.push('password_hash = ?');
            values.push(updates.passwordHash);
        }
        if (updates.emailVerified !== undefined) {
            fields.push('email_verified = ?');
            values.push(updates.emailVerified ? 1 : 0);
        }
        if (updates.googleId !== undefined) {
            fields.push('google_id = ?');
            values.push(updates.googleId);
        }
        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.avatarUrl !== undefined) {
            fields.push('avatar_url = ?');
            values.push(updates.avatarUrl);
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.lastLoginAt !== undefined) {
            fields.push('last_login_at = ?');
            values.push(updates.lastLoginAt);
        }

        fields.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        return this.db.run(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
    }

    // ========================================================================
    // Tenant Operations
    // ========================================================================

    async getTenantById(id: string): Promise<Tenant | null> {
        const row = await this.db.first<TenantRow>(
            'SELECT * FROM tenants WHERE id = ?',
            [id]
        );
        return row ? this.mapTenant(row) : null;
    }

    async getTenantByName(name: string): Promise<Tenant | null> {
        const row = await this.db.first<TenantRow>(
            'SELECT * FROM tenants WHERE name = ?',
            [name]
        );
        return row ? this.mapTenant(row) : null;
    }

    async createTenant(tenant: Tenant): Promise<D1Meta> {
        return this.db.run(
            `INSERT INTO tenants (id, name, global_quota_limit, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                tenant.id,
                tenant.name,
                tenant.globalQuotaLimit,
                tenant.createdAt,
                tenant.updatedAt,
            ]
        );
    }

    async updateTenant(id: string, updates: Partial<Tenant>): Promise<D1Meta> {
        const fields: string[] = [];
        const values: unknown[] = [];

        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.globalQuotaLimit !== undefined) {
            fields.push('global_quota_limit = ?');
            values.push(updates.globalQuotaLimit);
        }

        fields.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        return this.db.run(
            `UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
    }

    async deleteTenant(id: string): Promise<D1Meta> {
        return this.db.run('DELETE FROM tenants WHERE id = ?', [id]);
    }

    // ========================================================================
    // Tenant User Operations
    // ========================================================================

    async getTenantUser(tenantId: string, userId: string): Promise<TenantUser | null> {
        const row = await this.db.first<TenantUserRow>(
            'SELECT * FROM tenant_users WHERE tenant_id = ? AND user_id = ?',
            [tenantId, userId]
        );
        return row ? this.mapTenantUser(row) : null;
    }

    async getTenantUsers(tenantId: string): Promise<TenantUser[]> {
        const result = await this.db.all<TenantUserRow>(
            'SELECT * FROM tenant_users WHERE tenant_id = ? ORDER BY created_at',
            [tenantId]
        );
        return result.results.map(this.mapTenantUser);
    }

    async getUserTenants(userId: string): Promise<TenantUser[]> {
        const result = await this.db.all<TenantUserRow>(
            'SELECT * FROM tenant_users WHERE user_id = ? ORDER BY created_at',
            [userId]
        );
        return result.results.map(this.mapTenantUser);
    }

    async addUserToTenant(tenantId: string, userId: string, role: TenantRole): Promise<D1Meta> {
        return this.db.run(
            `INSERT INTO tenant_users (tenant_id, user_id, role, created_at)
             VALUES (?, ?, ?, ?)`,
            [tenantId, userId, role, Date.now()]
        );
    }

    async updateTenantUserRole(tenantId: string, userId: string, role: TenantRole): Promise<D1Meta> {
        return this.db.run(
            'UPDATE tenant_users SET role = ? WHERE tenant_id = ? AND user_id = ?',
            [role, tenantId, userId]
        );
    }

    async removeUserFromTenant(tenantId: string, userId: string): Promise<D1Meta> {
        return this.db.run(
            'DELETE FROM tenant_users WHERE tenant_id = ? AND user_id = ?',
            [tenantId, userId]
        );
    }

    async countTenantOwners(tenantId: string): Promise<number> {
        const result = await this.db.first<{ count: number }>(
            "SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ? AND role = 'owner'",
            [tenantId]
        );
        return result?.count ?? 0;
    }

    // ========================================================================
    // Session Operations
    // ========================================================================

    async getSessionById(id: string): Promise<Session | null> {
        const row = await this.db.first<SessionRow>(
            'SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL',
            [id]
        );
        return row ? this.mapSession(row) : null;
    }

    async getSessionByUserAndService(
        userId: string,
        tenantId: string | null,
        service: string
    ): Promise<Session | null> {
        const row = await this.db.first<SessionRow>(
            `SELECT * FROM sessions 
             WHERE user_id = ? AND (tenant_id = ? OR (tenant_id IS NULL AND ? IS NULL)) AND service = ? AND revoked_at IS NULL`,
            [userId, tenantId, tenantId, service]
        );
        return row ? this.mapSession(row) : null;
    }

    async getSessionByRefreshTokenHash(tokenHash: string): Promise<Session | null> {
        const row = await this.db.first<SessionRow>(
            'SELECT * FROM sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL',
            [tokenHash]
        );
        return row ? this.mapSession(row) : null;
    }

    async getUserSessions(userId: string): Promise<Session[]> {
        const result = await this.db.all<SessionRow>(
            'SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
            [userId]
        );
        return result.results.map(this.mapSession);
    }

    async createSession(session: Session): Promise<D1Meta> {
        return this.db.run(
            `INSERT INTO sessions (id, user_id, tenant_id, service, refresh_token_hash, device_info, ip_address, expires_at, created_at, updated_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                session.id,
                session.userId,
                session.tenantId,
                session.service,
                session.refreshTokenHash,
                session.deviceInfo,
                session.ipAddress,
                session.expiresAt,
                session.createdAt,
                session.updatedAt,
                session.revokedAt,
            ]
        );
    }

    async updateSession(id: string, updates: Partial<Session>): Promise<D1Meta> {
        const fields: string[] = [];
        const values: unknown[] = [];

        if (updates.refreshTokenHash !== undefined) {
            fields.push('refresh_token_hash = ?');
            values.push(updates.refreshTokenHash);
        }
        if (updates.deviceInfo !== undefined) {
            fields.push('device_info = ?');
            values.push(updates.deviceInfo);
        }
        if (updates.ipAddress !== undefined) {
            fields.push('ip_address = ?');
            values.push(updates.ipAddress);
        }
        if (updates.expiresAt !== undefined) {
            fields.push('expires_at = ?');
            values.push(updates.expiresAt);
        }
        if (updates.revokedAt !== undefined) {
            fields.push('revoked_at = ?');
            values.push(updates.revokedAt);
        }

        fields.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        return this.db.run(
            `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
    }

    async revokeSession(id: string): Promise<D1Meta> {
        return this.db.run(
            'UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE id = ?',
            [Date.now(), Date.now(), id]
        );
    }

    async revokeUserSessions(userId: string): Promise<D1Meta> {
        return this.db.run(
            'UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE user_id = ? AND revoked_at IS NULL',
            [Date.now(), Date.now(), userId]
        );
    }

    async revokeUserServiceSession(userId: string, service: string): Promise<D1Meta> {
        return this.db.run(
            'UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE user_id = ? AND service = ? AND revoked_at IS NULL',
            [Date.now(), Date.now(), userId, service]
        );
    }

    // ========================================================================
    // Refresh Token Operations (legacy compatibility)
    // ========================================================================

    async getRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
        const row = await this.db.first<RefreshTokenRow>(
            'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL',
            [tokenHash]
        );
        return row ? this.mapRefreshToken(row) : null;
    }

    async createRefreshToken(token: RefreshToken): Promise<D1Meta> {
        return this.db.run(
            `INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, expires_at, created_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                token.id,
                token.userId,
                token.tokenHash,
                token.deviceInfo,
                token.ipAddress,
                token.expiresAt,
                token.createdAt,
                token.revokedAt,
            ]
        );
    }

    async revokeRefreshToken(tokenHash: string): Promise<D1Meta> {
        return this.db.run(
            'UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?',
            [Date.now(), tokenHash]
        );
    }

    async revokeAllUserRefreshTokens(userId: string): Promise<D1Meta> {
        return this.db.run(
            'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
            [Date.now(), userId]
        );
    }

    // ========================================================================
    // Batch Operations
    // ========================================================================

    /**
     * Execute multiple statements in a single atomic batch.
     * All statements run with strong consistency.
     */
    async batch<T extends Record<string, unknown>[]>(
        statements: BatchStatement[]
    ): Promise<QueryResult<T[number]>[]> {
        return this.db.batch<T>(statements);
    }

    /**
     * Create a session and refresh token atomically.
     * This is a common pattern for login flows.
     */
    async createSessionWithToken(session: Session, token: RefreshToken): Promise<void> {
        await this.batch([
            {
                sql: `INSERT INTO sessions (id, user_id, tenant_id, service, refresh_token_hash, device_info, ip_address, expires_at, created_at, updated_at, revoked_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [
                    session.id,
                    session.userId,
                    session.tenantId,
                    session.service,
                    session.refreshTokenHash,
                    session.deviceInfo,
                    session.ipAddress,
                    session.expiresAt,
                    session.createdAt,
                    session.updatedAt,
                    session.revokedAt,
                ],
            },
            {
                sql: `INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, expires_at, created_at, revoked_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [
                    token.id,
                    token.userId,
                    token.tokenHash,
                    token.deviceInfo,
                    token.ipAddress,
                    token.expiresAt,
                    token.createdAt,
                    token.revokedAt,
                ],
            },
        ]);
    }

    /**
     * Create a tenant with an initial owner in a single atomic operation.
     */
    async createTenantWithOwner(tenant: Tenant, ownerId: string): Promise<void> {
        await this.batch([
            {
                sql: `INSERT INTO tenants (id, name, global_quota_limit, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?)`,
                params: [
                    tenant.id,
                    tenant.name,
                    tenant.globalQuotaLimit,
                    tenant.createdAt,
                    tenant.updatedAt,
                ],
            },
            {
                sql: `INSERT INTO tenant_users (tenant_id, user_id, role, created_at)
                      VALUES (?, ?, 'owner', ?)`,
                params: [tenant.id, ownerId, Date.now()],
            },
        ]);
    }

    // ========================================================================
    // Raw Access (for advanced queries)
    // ========================================================================

    /**
     * Execute a raw query and return the first result.
     * Use typed methods when possible for better type safety.
     */
    async rawFirst<T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[]
    ): Promise<T | null> {
        return this.db.first<T>(sql, params);
    }

    /**
     * Execute a raw query and return all results.
     * Use typed methods when possible for better type safety.
     */
    async rawAll<T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[]
    ): Promise<QueryResult<T>> {
        return this.db.all<T>(sql, params);
    }

    /**
     * Execute a raw write query.
     * Use typed methods when possible for better type safety.
     */
    async rawRun(sql: string, params?: unknown[]): Promise<D1Meta> {
        return this.db.run(sql, params);
    }

    // ========================================================================
    // Mappers (Row to Domain)
    // ========================================================================

    private mapUser(row: UserRow): User {
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
        };
    }

    private mapTenant(row: TenantRow): Tenant {
        return {
            id: row.id,
            name: row.name,
            globalQuotaLimit: row.global_quota_limit,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private mapTenantUser(row: TenantUserRow): TenantUser {
        return {
            tenantId: row.tenant_id,
            userId: row.user_id,
            role: row.role as TenantRole,
            createdAt: row.created_at,
        };
    }

    private mapSession(row: SessionRow): Session {
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

    private mapRefreshToken(row: RefreshTokenRow): RefreshToken {
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
}
