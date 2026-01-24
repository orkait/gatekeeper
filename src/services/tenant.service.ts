import type { AuthRepository, Tenant } from '../repositories/auth.repository';
import type { CreateTenantInput, UpdateTenantInput } from '../schemas/tenant.schema';
import type { ServiceResult } from '../types';

/**
 * TenantService - Business logic for tenant CRUD operations.
 *
 * Handles creation, retrieval, update, and deletion of tenants with proper
 * validation and ID generation.
 */
export class TenantService {
    constructor(private repository: AuthRepository) {}

    /**
     * Create a new tenant with an owner.
     * @param input - Tenant creation input
     * @param ownerId - User ID who will be the tenant owner
     */
    async createTenant(
        input: CreateTenantInput,
        ownerId: string
    ): Promise<ServiceResult<Tenant>> {
        // Check if tenant name already exists
        const existing = await this.repository.getTenantByName(input.name);
        if (existing) {
            return { success: false, error: 'Tenant name already exists' };
        }

        const now = Date.now();
        const tenant: Tenant = {
            id: this.generateId('tenant'),
            name: input.name,
            globalQuotaLimit: input.globalQuotaLimit ?? null,
            createdAt: now,
            updatedAt: now,
        };

        await this.repository.createTenantWithOwner(tenant, ownerId);

        return { success: true, data: tenant };
    }

    /**
     * Get a tenant by ID.
     */
    async getTenant(id: string): Promise<ServiceResult<Tenant>> {
        const tenant = await this.repository.getTenantById(id);
        if (!tenant) {
            return { success: false, error: 'Tenant not found' };
        }
        return { success: true, data: tenant };
    }

    /**
     * Get a tenant by name.
     */
    async getTenantByName(name: string): Promise<ServiceResult<Tenant>> {
        const tenant = await this.repository.getTenantByName(name);
        if (!tenant) {
            return { success: false, error: 'Tenant not found' };
        }
        return { success: true, data: tenant };
    }

    /**
     * Update a tenant.
     */
    async updateTenant(
        id: string,
        input: UpdateTenantInput
    ): Promise<ServiceResult<Tenant>> {
        const existing = await this.repository.getTenantById(id);
        if (!existing) {
            return { success: false, error: 'Tenant not found' };
        }

        // If name is being changed, check for duplicates
        if (input.name && input.name !== existing.name) {
            const duplicate = await this.repository.getTenantByName(input.name);
            if (duplicate) {
                return { success: false, error: 'Tenant name already exists' };
            }
        }

        const updates: Partial<Tenant> = {};
        if (input.name !== undefined) {
            updates.name = input.name;
        }
        if (input.globalQuotaLimit !== undefined) {
            updates.globalQuotaLimit = input.globalQuotaLimit;
        }

        await this.repository.updateTenant(id, updates);

        // Fetch the updated tenant
        const updated = await this.repository.getTenantById(id);
        return { success: true, data: updated! };
    }

    /**
     * Delete a tenant.
     * Note: This is a hard delete. Consider implementing soft delete for production.
     */
    async deleteTenant(id: string): Promise<ServiceResult<void>> {
        const existing = await this.repository.getTenantById(id);
        if (!existing) {
            return { success: false, error: 'Tenant not found' };
        }

        await this.repository.deleteTenant(id);
        return { success: true };
    }

    /**
     * Generate a tenant ID with the format: tenant_<timestamp>_<random>
     */
    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
}
