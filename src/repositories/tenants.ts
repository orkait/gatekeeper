import type { AuthDB, D1Meta } from '../utils/db';
import type { Tenant, TenantRow } from './types';
import { mapTenant } from './mappers';
import { executeUpdate } from './utils';

const TENANT_UPDATE_MAPPINGS = [
    { key: 'name' as const, column: 'name' },
    { key: 'globalQuotaLimit' as const, column: 'global_quota_limit' },
];

export class TenantRepository {
    constructor(private db: AuthDB) {}

    async getById(id: string): Promise<Tenant | null> {
        const row = await this.db.first<TenantRow>(
            'SELECT * FROM tenants WHERE id = ?',
            [id]
        );
        return row ? mapTenant(row) : null;
    }

    async getByName(name: string): Promise<Tenant | null> {
        const row = await this.db.first<TenantRow>(
            'SELECT * FROM tenants WHERE name = ?',
            [name]
        );
        return row ? mapTenant(row) : null;
    }

    async create(tenant: Tenant): Promise<D1Meta> {
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

    async update(id: string, updates: Partial<Tenant>): Promise<D1Meta> {
        return executeUpdate(this.db, 'tenants', id, updates, TENANT_UPDATE_MAPPINGS);
    }

    async delete(id: string): Promise<D1Meta> {
        return this.db.run('DELETE FROM tenants WHERE id = ?', [id]);
    }
}
