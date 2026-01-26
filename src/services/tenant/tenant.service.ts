import type { AuthRepository, Tenant, TenantUser } from '../../repositories';
import type { CreateTenantInput, UpdateTenantInput, AddUserToTenantInput, UpdateTenantUserRoleInput } from '../../schemas/tenant.schema';
import type { ServiceResult } from '../../types';
import { generateId, ok, err, nowMs } from '../shared';

// TenantService - Business logic for tenant CRUD operations.
// Handles creation, retrieval, and update, and deletion of tenants with proper
// validation and ID generation.
export class TenantService {
    constructor(private repository: AuthRepository) {}

    // Create a new tenant with an owner.
    async createTenant(
        input: CreateTenantInput,
        ownerId: string
    ): Promise<ServiceResult<Tenant>> {
        // Check if tenant name already exists
        const existing = await this.repository.getTenantByName(input.name);
        if (existing) {
            return err('Tenant name already exists');
        }

        const now = nowMs();
        const tenant: Tenant = {
            id: generateId('tenant'),
            name: input.name,
            globalQuotaLimit: input.globalQuotaLimit ?? null,
            createdAt: now,
            updatedAt: now,
        };

        await this.repository.createTenantWithOwner(tenant, ownerId);

        return ok(tenant);
    }

    async getTenant(id: string): Promise<ServiceResult<Tenant>> {
        const tenant = await this.repository.getTenantById(id);
        if (!tenant) {
            return err('Tenant not found');
        }
        return ok(tenant);
    }

    async getTenantByName(name: string): Promise<ServiceResult<Tenant>> {
        const tenant = await this.repository.getTenantByName(name);
        if (!tenant) {
            return err('Tenant not found');
        }
        return ok(tenant);
    }

    async updateTenant(
        id: string,
        input: UpdateTenantInput
    ): Promise<ServiceResult<Tenant>> {
        const existing = await this.repository.getTenantById(id);
        if (!existing) {
            return err('Tenant not found');
        }

        // If name is being changed, check for duplicates
        if (input.name && input.name !== existing.name) {
            const duplicate = await this.repository.getTenantByName(input.name);
            if (duplicate) {
                return err('Tenant name already exists');
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
        return ok(updated!);
    }

    async deleteTenant(id: string): Promise<ServiceResult<void>> {
        const existing = await this.repository.getTenantById(id);
        if (!existing) {
            return err('Tenant not found');
        }

        await this.repository.deleteTenant(id);
        return ok(undefined);
    }

    // ========================================================================
    // Tenant-User Operations
    // ========================================================================

    async addUserToTenant(
        input: AddUserToTenantInput
    ): Promise<ServiceResult<TenantUser>> {
        // Verify tenant exists
        const tenant = await this.repository.getTenantById(input.tenantId);
        if (!tenant) {
            return err('Tenant not found');
        }

        // Check if user is already a member
        const existing = await this.repository.getTenantUser(input.tenantId, input.userId);
        if (existing) {
            return err('User is already a member of this tenant');
        }

        await this.repository.addUserToTenant(input.tenantId, input.userId, input.role);

        const tenantUser = await this.repository.getTenantUser(input.tenantId, input.userId);
        return ok(tenantUser!);
    }

    async removeUserFromTenant(
        tenantId: string,
        userId: string
    ): Promise<ServiceResult<void>> {
        // Verify tenant exists
        const tenant = await this.repository.getTenantById(tenantId);
        if (!tenant) {
            return err('Tenant not found');
        }

        // Check if user is a member
        const tenantUser = await this.repository.getTenantUser(tenantId, userId);
        if (!tenantUser) {
            return err('User is not a member of this tenant');
        }

        // Prevent removing the last owner
        if (tenantUser.role === 'owner') {
            const ownerCount = await this.repository.countTenantOwners(tenantId);
            if (ownerCount <= 1) {
                return err('Cannot remove the last owner of a tenant');
            }
        }

        await this.repository.removeUserFromTenant(tenantId, userId);
        return ok(undefined);
    }

    async updateTenantUserRole(
        input: UpdateTenantUserRoleInput
    ): Promise<ServiceResult<TenantUser>> {
        // Verify tenant exists
        const tenant = await this.repository.getTenantById(input.tenantId);
        if (!tenant) {
            return err('Tenant not found');
        }

        // Check if user is a member
        const tenantUser = await this.repository.getTenantUser(input.tenantId, input.userId);
        if (!tenantUser) {
            return err('User is not a member of this tenant');
        }

        // Prevent demoting the last owner
        if (tenantUser.role === 'owner' && input.role !== 'owner') {
            const ownerCount = await this.repository.countTenantOwners(input.tenantId);
            if (ownerCount <= 1) {
                return err('Cannot demote the last owner of a tenant');
            }
        }

        await this.repository.updateTenantUserRole(input.tenantId, input.userId, input.role);

        const updated = await this.repository.getTenantUser(input.tenantId, input.userId);
        return ok(updated!);
    }

    async getUserTenants(userId: string): Promise<ServiceResult<TenantUser[]>> {
        const tenantUsers = await this.repository.getUserTenants(userId);
        return ok(tenantUsers);
    }

    async getTenantUsers(tenantId: string): Promise<ServiceResult<TenantUser[]>> {
        // Verify tenant exists
        const tenant = await this.repository.getTenantById(tenantId);
        if (!tenant) {
            return err('Tenant not found');
        }

        const tenantUsers = await this.repository.getTenantUsers(tenantId);
        return ok(tenantUsers);
    }

    async getTenantUser(
        tenantId: string,
        userId: string
    ): Promise<ServiceResult<TenantUser>> {
        const tenantUser = await this.repository.getTenantUser(tenantId, userId);
        if (!tenantUser) {
            return err('User is not a member of this tenant');
        }
        return ok(tenantUser);
    }
}
