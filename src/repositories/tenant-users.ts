import type { AuthDB, D1Meta } from '../utils/db';
import type { TenantUser, TenantRole } from './types';
import type { TenantUserRow } from '../db/row-types';
import { mapTenantUser } from './mappers';

export class TenantUserRepository {
    constructor(private db: AuthDB) {}

    async get(tenantId: string, userId: string): Promise<TenantUser | null> {
        const row = await this.db.first<TenantUserRow>(
            'SELECT * FROM tenant_users WHERE tenant_id = ? AND user_id = ?',
            [tenantId, userId]
        );
        return row ? mapTenantUser(row) : null;
    }

    async getByTenant(tenantId: string): Promise<TenantUser[]> {
        const result = await this.db.all<TenantUserRow>(
            'SELECT * FROM tenant_users WHERE tenant_id = ? ORDER BY created_at',
            [tenantId]
        );
        return result.results.map(mapTenantUser);
    }

    async getByUser(userId: string): Promise<TenantUser[]> {
        const result = await this.db.all<TenantUserRow>(
            'SELECT * FROM tenant_users WHERE user_id = ? ORDER BY created_at',
            [userId]
        );
        return result.results.map(mapTenantUser);
    }

    async add(tenantId: string, userId: string, role: TenantRole): Promise<D1Meta> {
        return this.db.run(
            `INSERT INTO tenant_users (tenant_id, user_id, role, created_at)
             VALUES (?, ?, ?, ?)`,
            [tenantId, userId, role, Date.now()]
        );
    }

    async updateRole(tenantId: string, userId: string, role: TenantRole): Promise<D1Meta> {
        return this.db.run(
            'UPDATE tenant_users SET role = ? WHERE tenant_id = ? AND user_id = ?',
            [role, tenantId, userId]
        );
    }

    async remove(tenantId: string, userId: string): Promise<D1Meta> {
        return this.db.run(
            'DELETE FROM tenant_users WHERE tenant_id = ? AND user_id = ?',
            [tenantId, userId]
        );
    }

    async countOwners(tenantId: string): Promise<number> {
        const result = await this.db.first<{ count: number }>(
            "SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ? AND role = 'owner'",
            [tenantId]
        );
        return result?.count ?? 0;
    }
}
