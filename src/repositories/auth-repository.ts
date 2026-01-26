/**
 * AuthRepository - Typed repository for auth-critical database operations.
 *
 * This repository uses explicit SQL queries with strong consistency for all
 * auth-path reads. It composes domain-specific repositories for modularity.
 *
 * Usage:
 *   const repo = new AuthRepository(env.DB);
 *   const user = await repo.getUserById(userId);
 */

import { createAuthDB, type AuthDB, type QueryResult, type D1Meta } from '../utils/db';
import type { User, RefreshToken } from '../types';
import type { Tenant, TenantUser, TenantRole, Session, BatchStatement } from './types';
import { UserRepository } from './users';
import { TenantRepository } from './tenants';
import { TenantUserRepository } from './tenant-users';
import { SessionRepository } from './sessions';
import { RefreshTokenRepository } from './tokens';

export class AuthRepository {
    private db: AuthDB;
    private users: UserRepository;
    private tenants: TenantRepository;
    private tenantUsers: TenantUserRepository;
    private sessions: SessionRepository;
    private tokens: RefreshTokenRepository;

    constructor(db: D1Database | AuthDB) {
        this.db = 'raw' in db ? db : createAuthDB(db);
        this.users = new UserRepository(this.db);
        this.tenants = new TenantRepository(this.db);
        this.tenantUsers = new TenantUserRepository(this.db);
        this.sessions = new SessionRepository(this.db);
        this.tokens = new RefreshTokenRepository(this.db);
    }

    // ========================================================================
    // User Operations
    // ========================================================================

    getUserById(id: string): Promise<User | null> {
        return this.users.getById(id);
    }

    getUserByEmail(email: string): Promise<User | null> {
        return this.users.getByEmail(email);
    }

    getUserByGoogleId(googleId: string): Promise<User | null> {
        return this.users.getByGoogleId(googleId);
    }

    createUser(user: User): Promise<D1Meta> {
        return this.users.create(user);
    }

    updateUser(id: string, updates: Partial<User>): Promise<D1Meta> {
        return this.users.update(id, updates);
    }

    // ========================================================================
    // Tenant Operations
    // ========================================================================

    getTenantById(id: string): Promise<Tenant | null> {
        return this.tenants.getById(id);
    }

    getTenantByName(name: string): Promise<Tenant | null> {
        return this.tenants.getByName(name);
    }

    createTenant(tenant: Tenant): Promise<D1Meta> {
        return this.tenants.create(tenant);
    }

    updateTenant(id: string, updates: Partial<Tenant>): Promise<D1Meta> {
        return this.tenants.update(id, updates);
    }

    deleteTenant(id: string): Promise<D1Meta> {
        return this.tenants.delete(id);
    }

    // ========================================================================
    // Tenant User Operations
    // ========================================================================

    getTenantUser(tenantId: string, userId: string): Promise<TenantUser | null> {
        return this.tenantUsers.get(tenantId, userId);
    }

    getTenantUsers(tenantId: string): Promise<TenantUser[]> {
        return this.tenantUsers.getByTenant(tenantId);
    }

    getUserTenants(userId: string): Promise<TenantUser[]> {
        return this.tenantUsers.getByUser(userId);
    }

    addUserToTenant(tenantId: string, userId: string, role: TenantRole): Promise<D1Meta> {
        return this.tenantUsers.add(tenantId, userId, role);
    }

    updateTenantUserRole(tenantId: string, userId: string, role: TenantRole): Promise<D1Meta> {
        return this.tenantUsers.updateRole(tenantId, userId, role);
    }

    removeUserFromTenant(tenantId: string, userId: string): Promise<D1Meta> {
        return this.tenantUsers.remove(tenantId, userId);
    }

    countTenantOwners(tenantId: string): Promise<number> {
        return this.tenantUsers.countOwners(tenantId);
    }

    // ========================================================================
    // Session Operations
    // ========================================================================

    getSessionById(id: string): Promise<Session | null> {
        return this.sessions.getById(id);
    }

    getSessionByUserAndService(
        userId: string,
        tenantId: string | null,
        service: string
    ): Promise<Session | null> {
        return this.sessions.getByUserAndService(userId, tenantId, service);
    }

    getSessionByRefreshTokenHash(tokenHash: string): Promise<Session | null> {
        return this.sessions.getByRefreshTokenHash(tokenHash);
    }

    getUserSessions(userId: string): Promise<Session[]> {
        return this.sessions.getByUser(userId);
    }

    createSession(session: Session): Promise<D1Meta> {
        return this.sessions.create(session);
    }

    updateSession(id: string, updates: Partial<Session>): Promise<D1Meta> {
        return this.sessions.update(id, updates);
    }

    revokeSession(id: string): Promise<D1Meta> {
        return this.sessions.revoke(id);
    }

    revokeUserSessions(userId: string): Promise<D1Meta> {
        return this.sessions.revokeByUser(userId);
    }

    revokeUserServiceSession(userId: string, service: string): Promise<D1Meta> {
        return this.sessions.revokeByUserAndService(userId, service);
    }

    // ========================================================================
    // Refresh Token Operations
    // ========================================================================

    getRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
        return this.tokens.get(tokenHash);
    }

    createRefreshToken(token: RefreshToken): Promise<D1Meta> {
        return this.tokens.create(token);
    }

    revokeRefreshToken(tokenHash: string): Promise<D1Meta> {
        return this.tokens.revoke(tokenHash);
    }

    revokeAllUserRefreshTokens(userId: string): Promise<D1Meta> {
        return this.tokens.revokeAllForUser(userId);
    }

    // ========================================================================
    // Batch Operations
    // ========================================================================

    async batch<T extends Record<string, unknown>[]>(
        statements: BatchStatement[]
    ): Promise<QueryResult<T[number]>[]> {
        return this.db.batch<T>(statements);
    }

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
    async rawFirst<T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[]
    ): Promise<T | null> {
        return this.db.first<T>(sql, params);
    }

    async rawAll<T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[]
    ): Promise<QueryResult<T>> {
        return this.db.all<T>(sql, params);
    }

    async rawRun(sql: string, params?: unknown[]): Promise<D1Meta> {
        return this.db.run(sql, params);
    }
}
