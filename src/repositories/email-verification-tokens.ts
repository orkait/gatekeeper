import type { AuthDB, D1Meta } from '../utils/db';
import type { EmailVerificationToken } from '../types';
import type { EmailVerificationTokenRow } from './types';
import { mapEmailVerificationToken } from '../db/mappers';

export class EmailVerificationTokenRepository {
    constructor(private db: AuthDB) {}

    async getByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null> {
        const row = await this.db.first<EmailVerificationTokenRow>(
            'SELECT * FROM email_verification_tokens WHERE token_hash = ? AND verified_at IS NULL',
            [tokenHash]
        );
        return row ? mapEmailVerificationToken(row) : null;
    }

    async getByUserId(userId: string): Promise<EmailVerificationToken | null> {
        const row = await this.db.first<EmailVerificationTokenRow>(
            'SELECT * FROM email_verification_tokens WHERE user_id = ? AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1',
            [userId]
        );
        return row ? mapEmailVerificationToken(row) : null;
    }

    async create(token: EmailVerificationToken): Promise<D1Meta> {
        return this.db.run(
            `INSERT INTO email_verification_tokens (id, user_id, token, token_hash, expires_at, created_at, verified_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                token.id,
                token.userId,
                token.token,
                token.tokenHash,
                token.expiresAt,
                token.createdAt,
                token.verifiedAt,
            ]
        );
    }

    async markAsVerified(tokenHash: string): Promise<D1Meta> {
        return this.db.run(
            'UPDATE email_verification_tokens SET verified_at = ? WHERE token_hash = ?',
            [Date.now(), tokenHash]
        );
    }

    async deleteExpired(): Promise<D1Meta> {
        return this.db.run(
            'DELETE FROM email_verification_tokens WHERE expires_at < ?',
            [Date.now()]
        );
    }

    async deleteForUser(userId: string): Promise<D1Meta> {
        return this.db.run(
            'DELETE FROM email_verification_tokens WHERE user_id = ?',
            [userId]
        );
    }
}
