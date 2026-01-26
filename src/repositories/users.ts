import type { AuthDB, D1Meta } from '../utils/db';
import type { User } from '../types';
import type { UserRow } from './types';
import { mapUser } from './mappers';
import { executeUpdate, transforms } from './utils';

const USER_UPDATE_MAPPINGS = [
    { key: 'email' as const, column: 'email' },
    { key: 'passwordHash' as const, column: 'password_hash' },
    { key: 'emailVerified' as const, column: 'email_verified', transform: transforms.toBoolean },
    { key: 'googleId' as const, column: 'google_id' },
    { key: 'name' as const, column: 'name' },
    { key: 'avatarUrl' as const, column: 'avatar_url' },
    { key: 'status' as const, column: 'status' },
    { key: 'lastLoginAt' as const, column: 'last_login_at' },
];

export class UserRepository {
    constructor(private db: AuthDB) {}

    async getById(id: string): Promise<User | null> {
        const row = await this.db.first<UserRow>(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );
        return row ? mapUser(row) : null;
    }

    async getByEmail(email: string): Promise<User | null> {
        const row = await this.db.first<UserRow>(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return row ? mapUser(row) : null;
    }

    async getByGoogleId(googleId: string): Promise<User | null> {
        const row = await this.db.first<UserRow>(
            'SELECT * FROM users WHERE google_id = ?',
            [googleId]
        );
        return row ? mapUser(row) : null;
    }

    async create(user: User): Promise<D1Meta> {
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

    async update(id: string, updates: Partial<User>): Promise<D1Meta> {
        return executeUpdate(this.db, 'users', id, updates, USER_UPDATE_MAPPINGS);
    }
}
