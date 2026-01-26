import type { AuthDB, D1Meta } from '../utils/db';
import type { Session, SessionRow } from './types';
import { mapSession } from './mappers';
import { executeUpdate } from './utils';

const SESSION_UPDATE_MAPPINGS = [
    { key: 'refreshTokenHash' as const, column: 'refresh_token_hash' },
    { key: 'deviceInfo' as const, column: 'device_info' },
    { key: 'ipAddress' as const, column: 'ip_address' },
    { key: 'expiresAt' as const, column: 'expires_at' },
    { key: 'revokedAt' as const, column: 'revoked_at' },
];

export class SessionRepository {
    constructor(private db: AuthDB) { }

    async getById(id: string): Promise<Session | null> {
        const row = await this.db.first<SessionRow>(
            'SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL',
            [id]
        );
        return row ? mapSession(row) : null;
    }

    async getByUserAndService(
        userId: string,
        tenantId: string | null,
        service: string
    ): Promise<Session | null> {
        const row = await this.db.first<SessionRow>(
            `SELECT * FROM sessions
             WHERE user_id = ? AND tenant_id IS ? AND service = ? AND revoked_at IS NULL`,
            [userId, tenantId, service]
        );
        return row ? mapSession(row) : null;
    }

    async getByRefreshTokenHash(tokenHash: string): Promise<Session | null> {
        const row = await this.db.first<SessionRow>(
            'SELECT * FROM sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL',
            [tokenHash]
        );
        return row ? mapSession(row) : null;
    }

    async getByUser(userId: string): Promise<Session[]> {
        const result = await this.db.all<SessionRow>(
            'SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
            [userId]
        );
        return result.results.map(mapSession);
    }

    async create(session: Session): Promise<D1Meta> {
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

    async update(id: string, updates: Partial<Session>): Promise<D1Meta> {
        return executeUpdate(this.db, 'sessions', id, updates, SESSION_UPDATE_MAPPINGS);
    }

    async revoke(id: string): Promise<D1Meta> {
        const now = Date.now();
        return this.db.run(
            'UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE id = ?',
            [now, now, id]
        );
    }

    async revokeByUser(userId: string): Promise<D1Meta> {
        const now = Date.now();
        return this.db.run(
            'UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE user_id = ? AND revoked_at IS NULL',
            [now, now, userId]
        );
    }

    async revokeByUserAndService(userId: string, service: string): Promise<D1Meta> {
        const now = Date.now();
        return this.db.run(
            'UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE user_id = ? AND service = ? AND revoked_at IS NULL',
            [now, now, userId, service]
        );
    }
}
