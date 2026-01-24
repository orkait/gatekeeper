import type { AuthRepository } from '../repositories/auth.repository';
import type { ServiceResult } from '../types';

/**
 * Override types.
 */
export type OverrideType = 'quota_boost' | 'tier_upgrade' | 'feature_grant';

/**
 * Admin override record.
 */
export interface AdminOverride {
    id: string;
    tenantId: string;
    type: OverrideType;
    value: string;
    reason: string;
    grantedBy: string;
    expiresAt: number | null;
    createdAt: number;
}

/**
 * Input for creating an admin override.
 */
export interface CreateOverrideInput {
    tenantId: string;
    type: OverrideType;
    value: string;
    reason: string;
    grantedBy: string;
    expiresInSeconds?: number;
}

/**
 * Parsed override values by type.
 */
export interface ParsedOverrides {
    quotaBoost: number | null;
    tierUpgrade: string | null;
    featureGrants: string[];
}

/**
 * Database row for admin_overrides table.
 */
interface AdminOverrideRow {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    type: string;
    value: string;
    reason: string;
    granted_by: string;
    expires_at: number | null;
    created_at: number;
}

/**
 * OverrideService - Admin overrides for quota boosts, tier upgrades, feature grants.
 *
 * Overrides allow admins to grant temporary or permanent exceptions to normal
 * subscription/quota rules for specific tenants.
 */
export class OverrideService {
    constructor(private repository: AuthRepository) {}

    // ========================================================================
    // Override Retrieval
    // ========================================================================

    /**
     * Get all active (non-expired) overrides for a tenant.
     */
    async getActiveOverrides(tenantId: string): Promise<ServiceResult<AdminOverride[]>> {
        const now = Date.now();

        const result = await this.repository.rawAll<AdminOverrideRow>(
            `SELECT * FROM admin_overrides 
             WHERE tenant_id = ? 
             AND (expires_at IS NULL OR expires_at > ?)
             ORDER BY created_at DESC`,
            [tenantId, now]
        );

        const overrides = result.results.map(this.mapRow);
        return { success: true, data: overrides };
    }

    /**
     * Get active overrides parsed into a structured format.
     * Useful for applying in authorize flow.
     */
    async getParsedOverrides(tenantId: string): Promise<ServiceResult<ParsedOverrides>> {
        const result = await this.getActiveOverrides(tenantId);
        if (!result.success || !result.data) {
            return { success: false, error: result.error };
        }

        const parsed: ParsedOverrides = {
            quotaBoost: null,
            tierUpgrade: null,
            featureGrants: [],
        };

        for (const override of result.data) {
            switch (override.type) {
                case 'quota_boost':
                    // Sum up all quota boosts
                    const boost = parseInt(override.value, 10);
                    if (!isNaN(boost)) {
                        parsed.quotaBoost = (parsed.quotaBoost ?? 0) + boost;
                    }
                    break;
                case 'tier_upgrade':
                    // Use the highest tier upgrade (enterprise > pro > free)
                    const tierOrder = { free: 0, pro: 1, enterprise: 2 };
                    const currentTier = parsed.tierUpgrade as keyof typeof tierOrder | null;
                    const newTier = override.value as keyof typeof tierOrder;
                    if (!currentTier || tierOrder[newTier] > tierOrder[currentTier]) {
                        parsed.tierUpgrade = override.value;
                    }
                    break;
                case 'feature_grant':
                    // Collect all granted features
                    if (!parsed.featureGrants.includes(override.value)) {
                        parsed.featureGrants.push(override.value);
                    }
                    break;
            }
        }

        return { success: true, data: parsed };
    }

    /**
     * Get overrides by type for a tenant.
     */
    async getOverridesByType(
        tenantId: string,
        type: OverrideType
    ): Promise<ServiceResult<AdminOverride[]>> {
        const now = Date.now();

        const result = await this.repository.rawAll<AdminOverrideRow>(
            `SELECT * FROM admin_overrides 
             WHERE tenant_id = ? AND type = ?
             AND (expires_at IS NULL OR expires_at > ?)
             ORDER BY created_at DESC`,
            [tenantId, type, now]
        );

        const overrides = result.results.map(this.mapRow);
        return { success: true, data: overrides };
    }

    /**
     * Check if a specific feature is granted via override.
     */
    async hasFeatureGrant(tenantId: string, featureName: string): Promise<boolean> {
        const result = await this.getOverridesByType(tenantId, 'feature_grant');
        if (!result.success || !result.data) {
            return false;
        }

        return result.data.some(o => o.value === featureName);
    }

    /**
     * Get the effective quota boost for a tenant.
     */
    async getQuotaBoost(tenantId: string): Promise<number> {
        const result = await this.getOverridesByType(tenantId, 'quota_boost');
        if (!result.success || !result.data) {
            return 0;
        }

        return result.data.reduce((sum, o) => {
            const boost = parseInt(o.value, 10);
            return isNaN(boost) ? sum : sum + boost;
        }, 0);
    }

    /**
     * Get the effective tier upgrade for a tenant.
     */
    async getTierUpgrade(tenantId: string): Promise<string | null> {
        const result = await this.getOverridesByType(tenantId, 'tier_upgrade');
        if (!result.success || !result.data || result.data.length === 0) {
            return null;
        }

        // Return the highest tier
        const tierOrder = { free: 0, pro: 1, enterprise: 2 };
        let highestTier: string | null = null;
        let highestOrder = -1;

        for (const override of result.data) {
            const order = tierOrder[override.value as keyof typeof tierOrder] ?? -1;
            if (order > highestOrder) {
                highestOrder = order;
                highestTier = override.value;
            }
        }

        return highestTier;
    }

    // ========================================================================
    // CRUD Operations
    // ========================================================================

    /**
     * Create a new admin override.
     */
    async createOverride(input: CreateOverrideInput): Promise<ServiceResult<AdminOverride>> {
        const now = Date.now();

        const override: AdminOverride = {
            id: this.generateId('ov'),
            tenantId: input.tenantId,
            type: input.type,
            value: input.value,
            reason: input.reason,
            grantedBy: input.grantedBy,
            expiresAt: input.expiresInSeconds ? now + input.expiresInSeconds * 1000 : null,
            createdAt: now,
        };

        await this.repository.rawRun(
            `INSERT INTO admin_overrides (id, tenant_id, type, value, reason, granted_by, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                override.id,
                override.tenantId,
                override.type,
                override.value,
                override.reason,
                override.grantedBy,
                override.expiresAt,
                override.createdAt,
            ]
        );

        return { success: true, data: override };
    }

    /**
     * Get an override by ID.
     */
    async getOverride(id: string): Promise<ServiceResult<AdminOverride>> {
        const row = await this.repository.rawFirst<AdminOverrideRow>(
            'SELECT * FROM admin_overrides WHERE id = ?',
            [id]
        );

        if (!row) {
            return { success: false, error: 'Override not found' };
        }

        return { success: true, data: this.mapRow(row) };
    }

    /**
     * List all overrides for a tenant (including expired).
     */
    async listOverrides(tenantId: string): Promise<ServiceResult<AdminOverride[]>> {
        const result = await this.repository.rawAll<AdminOverrideRow>(
            'SELECT * FROM admin_overrides WHERE tenant_id = ? ORDER BY created_at DESC',
            [tenantId]
        );

        const overrides = result.results.map(this.mapRow);
        return { success: true, data: overrides };
    }

    /**
     * Delete an override.
     */
    async deleteOverride(id: string): Promise<ServiceResult<void>> {
        const existing = await this.getOverride(id);
        if (!existing.success || !existing.data) {
            return { success: false, error: 'Override not found' };
        }

        await this.repository.rawRun(
            'DELETE FROM admin_overrides WHERE id = ?',
            [id]
        );

        return { success: true };
    }

    /**
     * Revoke all overrides for a tenant.
     */
    async revokeAllOverrides(tenantId: string): Promise<ServiceResult<number>> {
        const result = await this.repository.rawRun(
            'DELETE FROM admin_overrides WHERE tenant_id = ?',
            [tenantId]
        );

        return { success: true, data: result.changes ?? 0 };
    }

    /**
     * Expire an override immediately (set expires_at to now).
     */
    async expireOverride(id: string): Promise<ServiceResult<AdminOverride>> {
        const existing = await this.getOverride(id);
        if (!existing.success || !existing.data) {
            return { success: false, error: 'Override not found' };
        }

        await this.repository.rawRun(
            'UPDATE admin_overrides SET expires_at = ? WHERE id = ?',
            [Date.now(), id]
        );

        return this.getOverride(id);
    }

    /**
     * Extend an override's expiration.
     */
    async extendOverride(id: string, additionalSeconds: number): Promise<ServiceResult<AdminOverride>> {
        const existing = await this.getOverride(id);
        if (!existing.success || !existing.data) {
            return { success: false, error: 'Override not found' };
        }

        const currentExpires = existing.data.expiresAt ?? Date.now();
        const newExpires = currentExpires + additionalSeconds * 1000;

        await this.repository.rawRun(
            'UPDATE admin_overrides SET expires_at = ? WHERE id = ?',
            [newExpires, id]
        );

        return this.getOverride(id);
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    private mapRow(row: AdminOverrideRow): AdminOverride {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            type: row.type as OverrideType,
            value: row.value,
            reason: row.reason,
            grantedBy: row.granted_by,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
        };
    }
}

/**
 * Create an OverrideService instance.
 */
export function createOverrideService(repository: AuthRepository): OverrideService {
    return new OverrideService(repository);
}
