import type { AuthDB, D1Meta } from '../utils/db';
import type { RefreshToken } from '../types';
import type { RefreshTokenRow } from './types';
import { mapRefreshToken } from './mappers';

export class RefreshTokenRepository {
    constructor(private db: AuthDB) {}

    async get(tokenHash: string): Promise<RefreshToken | null> {
        const row = await this.db.first<RefreshTokenRow>(
            'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL',
            [tokenHash]
        );
        return row ? mapRefreshToken(row) : null;
    }

    async create(token: RefreshToken): Promise<D1Meta> {
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

    async revoke(tokenHash: string): Promise<D1Meta> {
        return this.db.run(
            'UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?',
            [Date.now(), tokenHash]
        );
    }

    async revokeAllForUser(userId: string): Promise<D1Meta> {
        return this.db.run(
            'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
            [Date.now(), userId]
        );
    }
}
